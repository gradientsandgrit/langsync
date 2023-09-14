package main

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/cenkalti/backoff/v4"
	"github.com/sirupsen/logrus"
	"time"
)

type workerHandlerFunc func(ctx context.Context, logger logrus.FieldLogger, msg types.Message) error

func newBackOff(ctx context.Context, maxAttempts uint64) backoff.BackOff {
	expBackoff := backoff.NewExponentialBackOff()
	// Can change duration here

	return backoff.WithContext(backoff.WithMaxRetries(expBackoff, maxAttempts), ctx)
}

func startSQSWorker(ctx context.Context, logger logrus.FieldLogger, sqsClient *sqs.Client, queueUrl string, handler workerHandlerFunc) {
	logger.Printf("Starting worker for queue %q.\n", queueUrl)

	go func() {
		for {
			if ctx.Err() != nil {
				break
			}

			// Receive messages from SQS
			logger.Printf("Receiving message from queue %q.\n", queueUrl)
			result, err := sqsClient.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
				QueueUrl:            aws.String(queueUrl),
				MaxNumberOfMessages: 1, // only process one message at a time to allow for easier multi-worker setup with health checks
				WaitTimeSeconds:     10,
				VisibilityTimeout:   20, // make initial timeout a bit longer to allow for health check to run
			})
			if err != nil {
				logger.Printf("Unable to receive message from queue %q, %v.", queueUrl, err)
				continue
			}

			// Process messages
			for _, msg := range result.Messages {
				logger.Printf("Processing message %q.\n", *msg.MessageId)

				err := applySQSHealthCheck(ctx, logger, sqsClient, queueUrl, msg, handler)
				if err != nil {
					logger.Printf("Unable to process message %q, %v.\n", *msg.MessageId, err)

					// Reset visibility timeout so the message gets reprocessed immediately
					_, visibilityResetErr := sqsClient.ChangeMessageVisibility(ctx, &sqs.ChangeMessageVisibilityInput{
						QueueUrl:          aws.String(queueUrl),
						ReceiptHandle:     msg.ReceiptHandle,
						VisibilityTimeout: 0,
					})
					if visibilityResetErr != nil {
						logger.Printf("Unable to reset visibility timeout for message %q, %v.\n", *msg.MessageId, visibilityResetErr)
					}

					continue
				}

				// Delete message from SQS
				_, err = sqsClient.DeleteMessage(ctx, &sqs.DeleteMessageInput{
					QueueUrl:      aws.String(queueUrl),
					ReceiptHandle: msg.ReceiptHandle,
				})
				if err != nil {
					logger.Printf("Unable to delete message %q from queue %q, %v.", *msg.MessageId, queueUrl, err)
					continue
				}

				logger.Printf("Deleted message %q from queue %q.\n", *msg.MessageId, queueUrl)
			}
		}

		logger.Printf("Exiting worker for queue %q.\n", queueUrl)
	}()
}

func applySQSHealthCheck(ctx context.Context, logger logrus.FieldLogger, sqsClient *sqs.Client, queueUrl string, msg types.Message, handler workerHandlerFunc) error {
	healthCheck := time.NewTicker(5 * time.Second)
	done := make(chan bool)
	defer func() {
		healthCheck.Stop()
		done <- true
	}()

	go func() {
		for {
			select {
			case <-ctx.Done():
				logger.Printf("Healthcheck received shutdown, resetting visibility timeout for %s\n", *msg.MessageId)
				// Reset visibility timeout so the message gets reprocessed immediately by another worker
				// This is called on shutdown
				_, err := sqsClient.ChangeMessageVisibility(context.Background(), &sqs.ChangeMessageVisibilityInput{
					QueueUrl:          aws.String(queueUrl),
					ReceiptHandle:     msg.ReceiptHandle,
					VisibilityTimeout: 0,
				})
				if err != nil {
					logger.Printf("Unable to change message visibility, %v.\n", err)
				}
				logger.Printf("Updated visibility timeout for message %q.\n", *msg.MessageId)
			case <-done:
				logger.Printf("Health check for message %q stopped.\n", *msg.MessageId)
				return
			case <-healthCheck.C:
				_, err := sqsClient.ChangeMessageVisibility(context.Background(), &sqs.ChangeMessageVisibilityInput{
					QueueUrl:          aws.String(queueUrl),
					ReceiptHandle:     msg.ReceiptHandle,
					VisibilityTimeout: 15,
				})
				if err != nil {
					logger.Printf("Unable to change message visibility, %v.\n", err)
				}
				logger.Printf("Updated visibility timeout for message %q.\n", *msg.MessageId)
			}
		}
	}()

	return handler(ctx, logger, msg)
}
