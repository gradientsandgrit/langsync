import flask
from flask import Flask, request
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.embeddings import OpenAIEmbeddings
from pinecone import Client as PineconeClient
import newrelic.agent
import tiktoken

from moderation import StrictOpenAIModerationChain

newrelic.agent.initialize()

enc = tiktoken.get_encoding("cl100k_base")

app = Flask(__name__)


@app.post("/ingest")
def ingest_endpoint():
    try:
        req_doc = request.json["document"]
        req_document_metadata = request.json["document_metadata"]
        req_document_full_text = request.json["document_text"]
    except KeyError:
        return flask.jsonify({"error": {
            "message": "missing required fields",
            "code": "missing_required_fields"
        }}), 400

    req_text_splitter = request.json["text_splitter"]
    if req_text_splitter["type"] == "recursive_character":
        splitter = RecursiveCharacterTextSplitter(separators=req_text_splitter["config"].get("separators"),
                                                  chunk_size=req_text_splitter["config"].get("chunk_size") or 4000,
                                                  chunk_overlap=req_text_splitter["config"].get("chunk_overlap") or 200)
    else:
        return flask.jsonify({"error": {
            "message": "invalid text splitter",
            "code": "invalid_text_splitter"
        }}), 400

    req_embeddings = request.json["embeddings"]
    if req_embeddings["type"] == "openai":
        embeddings = OpenAIEmbeddings(
            openai_api_key=req_embeddings["config"].get("api_key") or request.json["openai_api_key"],
        )
    else:
        return flask.jsonify({"error": {
            "message": "invalid embeddings",
            "code": "invalid_embeddings"
        }}), 400

        # same metadata for same document
    metadata = {
        **req_doc,
        **req_document_metadata
    }

    # use text splitter to split larger document text into smaller chunks
    texts = splitter.split_text(req_document_full_text)

    if len(texts) == 0:
        return flask.jsonify({"success": True}), 200

    moderation_chain_error = StrictOpenAIModerationChain(
        error=True,
        openai_api_key=req_embeddings["config"].get("api_key") or request.json["openai_api_key"],
    )
    try:
        for text in texts:
            moderation_chain_error.run(text)
    except ConnectionError:
        return flask.jsonify({"error": {
            "message": "failed to evaluate moderation chain",
            "code": "moderation_chain_failed",
            "is_transient": True
        }}), 500
    except ValueError:
        return flask.jsonify({"error": {
            "message": "detected violation of OpenAI's content policy",
            "code": "flagged_content"
        }}), 400
    except Exception:
        return flask.jsonify({"error": {
            "message": "unknown error",
            "code": "unknown"
        }}), 500

    # embed each chunk
    try:
        embeds = embeddings.embed_documents(texts)
    except ImportError:
        return flask.jsonify({"error": {
            "message": "embedding failed",
            "code": "embedding_failed",
        }}), 500
    except ValueError:
        return flask.jsonify({"error": {
            "message": "embedding failed",
            "code": "embedding_failed",
        }}), 500
    except ConnectionError:
        return flask.jsonify({"error": {
            "message": "embedding failed",
            "code": "embedding_failed",
            "is_transient": True
        }}), 500

    # upsert into sinks
    req_sinks = request.json["data_sinks"]
    for sink in req_sinks:
        if sink["type"] != "vector_store":
            continue

        vector_store_config = sink["config"]
        if vector_store_config["store_type"] == "pinecone":
            pineconeConfig = vector_store_config["config"]

            pineconeClient = PineconeClient(
                api_key=pineconeConfig["api_key"],
                region=pineconeConfig["environment"]
            )

            index = pineconeClient.Index(pineconeConfig["index_name"])

            # manually specify document ID (we couldn't do this with the langchain vector store class)
            try:
                index.upsert(
                    vectors=[
                        (
                            metadata["id"],
                            embedding,
                            {
                                **metadata,
                                "text": chunk_text
                            }
                        ) for embedding, chunk_text in zip(embeds, texts)
                    ],
                    namespace=pineconeConfig["namespace"]
                )
            except ValueError:
                return flask.jsonify({"error": {
                    "message": "upsert to vector store failed",
                    "code": "vector_store_upsert_failed"
                }}), 500
            except ConnectionError:
                return flask.jsonify({"error": {
                    "message": "upsert to vector store failed",
                    "code": "vector_store_upsert_failed",
                    "is_transient": True
                }}), 500
        else:
            return flask.jsonify({"error": {
                "message": "invalid vector store",
                "code": "invalid_vector_store"
            }}), 400

    return flask.jsonify({"success": True}), 200


@app.delete("/documents/<document_id>")
def delete_document_endpoint(document_id):
    req_integration = request.json["integration"]
    req_doc_type = request.json["document_type"]

    # delete from sinks
    req_sinks = request.json["data_sinks"]
    for sink in req_sinks:
        if sink["type"] != "vector_store":
            continue

        vector_store_config = sink["config"]
        if vector_store_config["store_type"] == "pinecone":
            pineconeConfig = vector_store_config["config"]

            pineconeClient = PineconeClient(
                api_key=pineconeConfig["api_key"],
                region=pineconeConfig["environment"]
            )

            index = pineconeClient.Index(pineconeConfig["index_name"])

            try:
                index.delete_by_metadata(
                    filter={
                        "integration": req_integration,
                        "document_type": req_doc_type,
                        "id": document_id
                    }
                )
            except ValueError:
                return flask.jsonify({"error": {
                    "message": "delete from vector store failed",
                    "code": "vector_store_delete_failed"
                }}), 500
            except ConnectionError:
                return flask.jsonify({"error": {
                    "message": "delete from vector store failed",
                    "code": "vector_store_delete_failed",
                    "is_transient": True
                }}), 500
            except Exception:
                return flask.jsonify({"error": {
                    "message": "delete from vector store failed",
                    "code": "vector_store_delete_failed"
                }}), 500
        else:
            return flask.jsonify({"error": {
                "message": "invalid vector store",
                "code": "invalid_vector_store"
            }}), 400

    return flask.jsonify({"success": True}), 200


@app.post("/count")
def count_endpoint():
    req_document_full_text = request.json["document_text"]

    # count tokens of full text
    token_count = len(enc.encode(req_document_full_text))
    return flask.jsonify({"success": True, "token_count": token_count}), 200
