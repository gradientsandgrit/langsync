package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/cenkalti/backoff/v4"
	"github.com/sirupsen/logrus"
	"golang.org/x/sync/semaphore"
	"net"
	"net/http"
	"time"
)

type LinearDocumentType string

const (
	LinearDocumentTypeIssue LinearDocumentType = "issue"
)

type LinearAPIClientImpl struct {
	logger     logrus.FieldLogger
	httpClient *http.Client
	sema       *semaphore.Weighted
}

func newLinearApiClient(logger logrus.FieldLogger) DataSourceApiClient {
	return &LinearAPIClientImpl{
		httpClient: &http.Client{
			Timeout: time.Second * 30,
		},
		logger: logger,

		// https://developers.linear.app/docs/graphql/working-with-the-graphql-api/rate-limiting
		sema: semaphore.NewWeighted(5),
	}
}

const issueFragment = `id
      title
	  updatedAt
	  url
      description
      creator {
        id
        name
        email
        displayName
      }
      assignee {
        id
        name
        email
        displayName
      }
      state {
        name
        type
      }  `

type LinearIssue struct {
	Id          string `json:"id"`
	Title       string `json:"title"`
	URL         string `json:"url"`
	Description string `json:"description"`
	UpdatedAt   string `json:"updatedAt"`
	Creator     struct {
		Id    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	Assignee struct {
		Id    string `json:"id"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	State struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
}

func (client *LinearAPIClientImpl) listIssues(ctx context.Context, integration LinearIntegrationConnection) (map[string]IndexedDocument, error) {
	var cursor *string
	var indexedDocuments = make(map[string]IndexedDocument)

	for {
		body := map[string]any{
			// https://developers.linear.app/docs/graphql/working-with-the-graphql-api/pagination
			"variables": map[string]any{
				"after": cursor,
				"first": 100,
			},
			"query": `
query getIssues($after: String, $first: Int) {
  issues(after: $after, first: $first) {
    nodes {
      ` + issueFragment + `
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}`,
		}

		marshalledBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}

		// https://studio.apollographql.com/public/Linear-API/variant/current/explorer
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.linear.app/graphql", bytes.NewBuffer(marshalledBody))
		if err != nil {
			return nil, err
		}

		req.Header.Set("Authorization", "Bearer "+integration.Config.AccessToken)

		req.Header.Set("Content-Type", "application/json")

		res, err := backoff.RetryWithData[*http.Response](
			func() (*http.Response, error) {
				res, err := client.httpClient.Do(req)
				if err != nil {
					if err, ok := err.(net.Error); ok && err.Timeout() {
						return nil, err
					}
					return nil, backoff.Permanent(err)
				}

				if res.StatusCode != http.StatusOK {
					type errorResponse struct {
						Errors []struct {
							Message    string `json:"message"`
							Extensions struct {
								Code string `json:"code"`
							}
						} `json:"errors"`
					}

					var errResp errorResponse
					err = json.NewDecoder(res.Body).Decode(&errResp)
					if err != nil {
						return nil, err
					}

					if len(errResp.Errors) <= 0 {
						return nil, backoff.Permanent(fmt.Errorf("unexpected error %d", res.StatusCode))
					}

					linearErr := errResp.Errors[0]

					if linearErr.Extensions.Code == "RATELIMITED" {
						return res, fmt.Errorf("rate limited")
					}

					return res, backoff.Permanent(fmt.Errorf("unexpected error %q: %s", linearErr.Extensions.Code, linearErr.Message))

				}

				return res, nil
			},
			newBackOff(ctx, 10),
		)
		if err != nil {
			return nil, err
		}

		type searchResp struct {
			Data struct {
				Issues struct {
					Nodes    []LinearIssue `json:"nodes"`
					PageInfo struct {
						EndCursor   *string `json:"endCursor"`
						HasNextPage bool    `json:"hasNextPage"`
					} `json:"pageInfo"`
				}
			} `json:"data"`
		}

		var searchResponse searchResp
		err = json.NewDecoder(res.Body).Decode(&searchResponse)
		if err != nil {
			return nil, err
		}

		for _, result := range searchResponse.Data.Issues.Nodes {
			indexedDocuments[result.Id] = IndexedDocument{
				Integration:        IntegrationLinear,
				DocumentType:       string(LinearDocumentTypeIssue),
				Id:                 result.Id,
				Title:              result.Title,
				URL:                result.URL,
				FreshnessIndicator: result.UpdatedAt,
			}
		}

		if !searchResponse.Data.Issues.PageInfo.HasNextPage {
			break
		}

		cursor = searchResponse.Data.Issues.PageInfo.EndCursor
	}

	return indexedDocuments, nil
}

func (client *LinearAPIClientImpl) ListDocuments(ctx context.Context, integration IntegrationConnection) (map[string]IndexedDocument, error) {
	err := client.sema.Acquire(ctx, 1)
	if err != nil {
		return nil, err
	}
	defer client.sema.Release(1)

	client.logger.Printf("Listing all Linear issues\n")

	issues, err := client.listIssues(ctx, integration.LinearIntegrationConnection)
	if err != nil {
		return nil, err
	}

	allDocuments := make(map[string]IndexedDocument)

	for id, issue := range issues {
		allDocuments[id] = issue
	}

	return allDocuments, nil
}

func (client *LinearAPIClientImpl) GetDocumentContent(ctx context.Context, documentType string, id string, integration IntegrationConnection) (string, map[string]any, error) {
	err := client.sema.Acquire(ctx, 1)
	if err != nil {
		return "", nil, err
	}
	defer client.sema.Release(1)

	switch documentType {
	case string(LinearDocumentTypeIssue):
		{
			issue, err := client.getIssue(ctx, id, integration)
			if err != nil {
				return "", nil, err
			}

			textContent := "# " + issue.Title + "\n" + issue.Description

			stringifiedCreator, err := json.Marshal(issue.Creator)
			if err != nil {
				return "", nil, err
			}
			stringifiedAssignee, err := json.Marshal(issue.Assignee)
			if err != nil {
				return "", nil, err
			}

			return textContent, map[string]any{
				"title":    issue.Title,
				"creator":  string(stringifiedCreator),
				"assignee": string(stringifiedAssignee),
				"state":    issue.State.Name,
			}, nil
		}
	default:
		return "", nil, fmt.Errorf("unknown document type %q", documentType)
	}

}

func (client *LinearAPIClientImpl) getIssue(ctx context.Context, issueId string, integration IntegrationConnection) (*LinearIssue, error) {
	body := map[string]any{
		// https://developers.linear.app/docs/graphql/working-with-the-graphql-api/pagination
		"variables": map[string]any{
			"issueId": issueId,
		},
		"query": `query getIssues($issueId: String!) {
  issue(id: $issueId) {
    ` + issueFragment + `
  }
}
`,
	}

	marshalledBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	// https://studio.apollographql.com/public/Linear-API/variant/current/explorer
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.linear.app/graphql", bytes.NewBuffer(marshalledBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+integration.LinearIntegrationConnection.Config.AccessToken)

	req.Header.Set("Content-Type", "application/json")

	res, err := backoff.RetryWithData[*http.Response](
		func() (*http.Response, error) {
			res, err := client.httpClient.Do(req)
			if err != nil {
				if err, ok := err.(net.Error); ok && err.Timeout() {
					return nil, err
				}
				return nil, backoff.Permanent(err)
			}

			if res.StatusCode != http.StatusOK {
				type errorResponse struct {
					Errors []struct {
						Message    string `json:"message"`
						Extensions struct {
							Code string `json:"code"`
						}
					} `json:"errors"`
				}

				var errResp errorResponse
				err = json.NewDecoder(res.Body).Decode(&errResp)
				if err != nil {
					return nil, err
				}

				if len(errResp.Errors) <= 0 {
					return nil, backoff.Permanent(fmt.Errorf("unexpected error %d", res.StatusCode))
				}

				linearErr := errResp.Errors[0]

				if linearErr.Extensions.Code == "RATELIMITED" {
					return res, fmt.Errorf("rate limited")
				}

				return res, backoff.Permanent(fmt.Errorf("unexpected error %q: %s", linearErr.Extensions.Code, linearErr.Message))

			}

			return res, nil
		},
		newBackOff(ctx, 10),
	)
	if err != nil {
		return nil, err
	}

	type getIssueResp struct {
		Data struct {
			Issue LinearIssue `json:"issue"`
		} `json:"data"`
	}

	var issueResp getIssueResp
	err = json.NewDecoder(res.Body).Decode(&issueResp)
	if err != nil {
		return nil, err
	}

	return &issueResp.Data.Issue, nil
}

func (client *LinearAPIClientImpl) GetDocument(ctx context.Context, documentType string, id string, integration IntegrationConnection) (IndexedDocument, error) {
	err := client.sema.Acquire(ctx, 1)
	if err != nil {
		return IndexedDocument{}, err
	}
	defer client.sema.Release(1)

	switch documentType {
	case string(LinearDocumentTypeIssue):
		{
			issue, err := client.getIssue(ctx, id, integration)
			if err != nil {
				return IndexedDocument{}, err
			}

			return IndexedDocument{
				Integration:        IntegrationLinear,
				DocumentType:       string(LinearDocumentTypeIssue),
				Id:                 issue.Id,
				Title:              issue.Title,
				URL:                issue.URL,
				FreshnessIndicator: issue.UpdatedAt,
			}, nil
		}
	default:
		return IndexedDocument{}, fmt.Errorf("unknown document type %q", documentType)
	}
}
