package main

import (
	"context"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/newrelic/go-agent/v3/integrations/logcontext-v2/nrlogrus"
	"github.com/newrelic/go-agent/v3/newrelic"
	"github.com/sirupsen/logrus"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const NUM_WORKERS = 4

func main() {
	_ = godotenv.Load("../.env")

	ctx, cancel := context.WithCancel(context.Background())

	logger := logrus.New()

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigs
		logger.Println("Gracefully shutting down...")
		cancel()
	}()

	newrelicApp, err := newrelic.NewApplication(
		newrelic.ConfigAppName("langsync-worker"),
		newrelic.ConfigLicense(os.Getenv("NEW_RELIC_LICENSE_KEY")),
	)
	if err != nil {
		logger.Fatalf("unable to create newrelic application, %v", err)
	}

	go func() {
		<-ctx.Done()
		logger.Println("Shutting down New Relic...")
		newrelicApp.Shutdown(10 * time.Second)
		logger.Println("New Relic shut down.")
	}()

	nrlogrusFormatter := nrlogrus.NewFormatter(newrelicApp, &logrus.TextFormatter{})

	logger.SetFormatter(nrlogrusFormatter)

	awsConfig, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		logger.Fatalf("unable to load SDK config, %v", err)
	}

	sqsClient := sqs.NewFromConfig(awsConfig)

	notionHelperEndpoint := os.Getenv("NOTION_HELPER_ENDPOINT")
	if notionHelperEndpoint == "" {
		logger.Fatalf("NOTION_HELPER_ENDPOINT must be set")
	}

	documentHelperEndpoint := os.Getenv("DOCUMENT_HELPER_ENDPOINT")
	if documentHelperEndpoint == "" {
		logger.Fatalf("DOCUMENT_HELPER_ENDPOINT must be set")
	}

	openAIApiKey := os.Getenv("OPENAI_API_KEY")
	if openAIApiKey == "" {
		logger.Fatalf("OPENAI_API_KEY must be set")
	}

	notionApiClient := newNotionApiClient(notionHelperEndpoint, logger)
	linearApiClient := newLinearApiClient(logger)
	documentHelper := newDocumentHelper(documentHelperEndpoint, logger)

	clients := map[Integration]DataSourceApiClient{
		IntegrationNotion: notionApiClient,
		IntegrationLinear: linearApiClient,
	}

	// Make sure not to use a connection pooler like pgbouncer, alternatively update the
	// prepared statement mode (see https://github.com/jackc/pgx/issues/602)
	pool, err := pgxpool.New(ctx, os.Getenv("POSTGRES_URL_NON_POOLING"))
	if err != nil {
		logger.Fatalf("unable to connect to database, %v", err)
	}

	go func() {
		<-ctx.Done()
		logger.Printf("Closing database connection pool, waiting for %d acquired/%d idle/%d total connections to be released...\n", pool.Stat().AcquiredConns(), pool.Stat().IdleConns(), pool.Stat().TotalConns())
		pool.Close()
		logger.Println("Closed database connection pool.")
	}()

	testClient, err := pool.Acquire(ctx)
	if err != nil {
		logger.Fatalf("unable to acquire connection from pool, %v", err)
	}
	testClient.Release()

	// Start NUM_WORKERS goroutines and receive messages from SQS
	for i := 0; i < NUM_WORKERS; i++ {
		startSQSWorker(ctx, logger, sqsClient, os.Getenv("INDEX_QUEUE_URL"), processIndexMessage(pool, newrelicApp, clients, documentHelper, openAIApiKey))
	}

	// Keep the main thread alive
	srv := http.Server{
		Addr: ":8080",
	}

	go func() {
		<-ctx.Done()
		logger.Println("Shutting down...")
		err := srv.Shutdown(context.Background())
		if err != nil {
			logger.Printf("Unable to shutdown server, %v", err)
		}
		_ = srv.Close()
		logger.Println("Server shut down.")
	}()

	srv.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Fatalf("listen: %s\n", err)
	}
}
