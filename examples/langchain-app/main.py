from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor
from langchain.vectorstores.pinecone import Pinecone as PineconeVectorStore
from langchain.chains import RetrievalQA
from langchain.embeddings.openai import OpenAIEmbeddings
from langchain.llms import OpenAI
from dotenv import load_dotenv
import pinecone

load_dotenv()

llm = OpenAI(temperature=0)
embedding = OpenAIEmbeddings()

pinecone.init()
index = pinecone.Index("langsync-demo")

vector_store = PineconeVectorStore(index, embedding, "text", "default")

while True:
  query = input("Enter query: ")

  base_retriever = vector_store.as_retriever()

  compressor = LLMChainExtractor.from_llm(llm)
  compression_retriever = ContextualCompressionRetriever(base_compressor=compressor, base_retriever=base_retriever)

  qa = RetrievalQA.from_chain_type(llm, "stuff", retriever=compression_retriever)

  print(qa.run(query))
