# Q&A your knowledgebase with LangChain and langsync

In this example, we'll show you how to use LangChain and langsync to build a Q&A system for your knowledgebase. 

## Prerequisites

To run this example, you'll have to create a Pinecone database, which we'll use to store your knowledgebase and retrieve answers to questions. You can create a database by creating a free account on [Pinecone](https://www.pinecone.io/).

You'll have to have the following installed:

- Python 3.6+

Please retrieve the following API keys:

- [OpenAI](https://platform.openai.com/)
- [Pinecone](https://www.pinecone.io/)

## Sync your data using langsync

Start by [signing up](https://langsync.gradientsandgrit.com) to langsync and configuring your pipeline. Connect your integrations of choice and enable the pipeline. You can continue with the guide while the initial sync is running.

## (Optional) Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate
```

## Install dependencies

```bash
pip install python-dotenv langchain pinecone-client openai tiktoken
```

## Configure your environment

Create a `.env` file in the root of this directory with the following contents:

```text
OPENAI_API_KEY=<your OpenAI API key>

PINECONE_API_KEY=<your Pinecone API key>
PINECONE_ENVIRONMENT=<Pinecone environment name>
```
## Run Q&A

Finally, you can run the Q&A script:

```bash
python main.py
```
