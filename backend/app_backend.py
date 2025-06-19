import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import chromadb
from chromadb.api.types import EmbeddingFunction, Documents, Embeddings # Import ChromaDB's EmbeddingFunction protocol
from dotenv import load_dotenv
import ollama 
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from langchain_ollama import OllamaEmbeddings # Updated import
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LangchainDocument # Alias to avoid conflict


load_dotenv() # Load environment variables from .env file

app = Flask(__name__)
# Allow CORS for development. In production, restrict to your frontend's origin.
CORS(app)

# --- Configuration ---
# These paths are relative to the container's /app directory
DOCUMENTS_DIR = os.getenv('DOCUMENTS_DIR', './documents') # Directory inside container where text files are mounted
CHROMA_DB_PATH = os.getenv('CHROMA_DB_PATH', './chroma_db') # Path inside container for ChromaDB persistence
COLLECTION_NAME = "llm_documents_collection" # Unique collection name
OLLAMA_HOST = os.getenv('OLLAMA_HOST', 'http://ollama:11434') # Point to Ollama service name in compose network
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'nomic-embed-text') # Nomic embedding model for ChromaDB
LLM_MODEL = os.getenv('LLM_MODEL', 'gemma3:1b') # Not used directly here, but for context
CHUNK_SIZE = int(os.getenv('CHUNK_SIZE', 1000))
CHUNK_OVERLAP = int(os.getenv('CHUNK_OVERLAP', 200))

# Initialize Ollama client for direct use if needed, and for ChromaDB's embedding function
ollama_client = ollama.Client(host=OLLAMA_HOST)

# Initialize Langchain's OllamaEmbeddings
try:
    langchain_ollama_ef = OllamaEmbeddings(        
        model=EMBEDDING_MODEL,
        base_url=OLLAMA_HOST
    )
    # Ensure ChromaDB directory exists
    os.makedirs(CHROMA_DB_PATH, exist_ok=True)
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
    )
    print(f"ChromaDB collection '{COLLECTION_NAME}' ready.")
except Exception as e:
    print(f"Error initializing ChromaDB collection with OllamaEmbeddingFunction: {e}")
    print("Please ensure Ollama is running and the embedding model "
          f"'{EMBEDDING_MODEL}' is pulled. Exiting.")
    exit(1) # Exit if ChromaDB setup fails

# No longer using simulated_xattrs. Attributes will be read from the file system.
# simulated_xattrs = { ... }

def get_file_xattr(filepath, attr_name, default="unknown"):
    """Safely retrieves an extended attribute from a file."""
    try:
        # attr_name is expected to be the full name like 'user.status'
        # If you only pass 'status', it won't find 'user.status' unless you add the prefix here.
        # For this change, we assume attr_name is already the full 'user.xyz'
        value_bytes = os.getxattr(filepath, f"user.{attr_name}")
        return value_bytes.decode('utf-8', errors='replace')
    except OSError: # Attribute not found or other OS error
        return default
    except Exception as e:
        print(f"Unexpected error reading xattr '{attr_name}' for {filepath}: {e}")
        return default

text_splitter = RecursiveCharacterTextSplitter(chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP)

def process_document_and_store_chunks(filepath):
    """
    Reads a document, splits it into chunks using Langchain,
    and stores these chunks in ChromaDB.
    Deletes existing chunks for the file before adding new ones.
    """
    filename = os.path.basename(filepath)
    print(f"Processing document: {filename}")

    if not (os.path.isfile(filepath) and filename.endswith('.txt')):
        print(f"Skipping non-txt file or directory: {filename}")
        return False

    try:
        # Delete existing chunks for this document to ensure freshness
        collection.delete(where={"original_filename": filename})
        print(f"Deleted existing chunks for {filename} from ChromaDB.")

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        chunks = text_splitter.split_text(content)

        if not chunks:
            print(f"No chunks generated for {filename}. Skipping.")
            return False

        doc_metadatas = []
        doc_ids = []
        doc_contents = []

        base_doc_id_prefix = f"doc_{os.path.splitext(filename)[0].replace(' ', '_').replace('-', '_').lower()}"
        
        # Read actual extended attributes from the file
        original_file_xattrs = {
            "user.status": get_file_xattr(filepath, "status", default="unknown"),
            "user.approved_by": get_file_xattr(filepath, "approved_by", default="unknown")
        }
        print(f"Attributes for {filename}: {original_file_xattrs}") # Log the attributes

        for i, chunk_text in enumerate(chunks):
            chunk_id = f"{base_doc_id_prefix}_chunk_{i}"
            chunk_metadata = {
                "original_filename": filename,
                "chunk_index": i,
                "total_chunks": len(chunks),
                **original_file_xattrs # Spread original file's xattrs
            }
            doc_ids.append(chunk_id)
            doc_contents.append(chunk_text)
            doc_metadatas.append(chunk_metadata)

        if doc_contents:
            chunk_embeddings = langchain_ollama_ef.embed_documents(doc_contents)
            collection.add(
                documents=doc_contents,
                embeddings=chunk_embeddings,
                metadatas=doc_metadatas,
                ids=doc_ids
            )
            print(f"Successfully processed and stored {len(chunks)} chunks for '{filename}'.")
        return True

    except Exception as e:
        print(f"Error processing and storing chunks for file {filename}: {e}")
        return False

def sideload_documents_to_chroma():
    """
    Processes all .txt documents in the DOCUMENTS_DIR using Langchain for chunking and embedding.
    """
    print(f"Sideloading documents from '{DOCUMENTS_DIR}' to ChromaDB...")
    if not os.path.exists(DOCUMENTS_DIR):
        print(f"Error: Document directory '{DOCUMENTS_DIR}' not found. Please mount it or create dummy files.")
        return

    listed_files = os.listdir(DOCUMENTS_DIR)
    print(f"Files found in '{DOCUMENTS_DIR}': {listed_files}") # Enhanced logging

    for filename in listed_files:
        filepath = os.path.join(DOCUMENTS_DIR, filename)
        print(f"Attempting to process file from initial scan: {filepath}")
        process_document_and_store_chunks(filepath)
    print(f"Sideloading complete.")


# --- API Endpoints ---

@app.route('/api/search', methods=['POST'])
def search_documents():
    """
    Receives a user query, performs semantic search with metadata filtering,
    and returns relevant document chunks.
    """
    data = request.json
    user_query = data.get('query')
    current_user = data.get('user', None) # Get the current user from the request
    
    if not user_query:
        return jsonify({"error": "Query is required"}), 400

    try: # sourcery skip: hoist-statement-from-if, hoist-statement-from-else
        chroma_where_filter = {} # Initialize an empty filter

        if current_user == "Suske":
            # Suske sees documents with status 'final' AND approved_by 'Wiske'
            chroma_where_filter = {
                "$and": [
                    {"user.status": "final"},
                    {"user.approved_by": "Wiske"}
                ]
            }
            print(f"Search by Suske: Applying filters {chroma_where_filter}")
        elif current_user == "Wiske":
            # Wiske sees all documents, so no metadata filter is applied
            # An empty where clause or a clause that matches all, like checking for a common field.
            # We will pass None to indicate no metadata filtering to collection.query
            print("Search by Wiske: No metadata filters applied.")
            chroma_where_filter = None # Signal to omit the 'where' clause
        else:
            # Default behavior if no user or unknown user (could be more restrictive)
            print(f"Search by unknown user or no user specified. Applying default restrictive filters.")
            chroma_where_filter = {"user.status": "non_existent_default", "user.approved_by": "non_existent_default"} # Effectively finds nothing

        # Explicitly generate embedding for the user query
        query_embedding = langchain_ollama_ef.embed_query(user_query)

        query_params = {
            "query_embeddings": [query_embedding],
            "n_results": 5,
            "include": ['documents', 'metadatas', 'distances']
        }

        if chroma_where_filter is not None:
            query_params["where"] = chroma_where_filter
        
        results = collection.query(**query_params)


        found_chunks = []
        if results and results['documents'] and results['metadatas']:
            for i in range(len(results['documents'][0])):
                chunk_content = results['documents'][0][i]
                chunk_metadata = results['metadatas'][0][i]
                found_chunks.append({
                    "id": results['ids'][0][i],
                    "original_filename": chunk_metadata.get('original_filename', 'Unknown'),
                    "content": chunk_content, # This is the chunk content
                    "user.status": chunk_metadata.get('user.status', 'unknown'), # From original file
                    "user.approved_by": chunk_metadata.get('user.approved_by', 'unknown'), # From original file
                    "chunk_index": chunk_metadata.get('chunk_index', -1),
                    "distance": results['distances'][0][i] # Include distance for debugging/info
                })
        
        return jsonify(found_chunks)

    except Exception as e:
        print(f"Error during search: {e}")
        return jsonify({"error": f"An error occurred during document search: {str(e)}"}), 500

@app.route('/api/documents', methods=['GET'])
def get_all_documents_metadata():
    """
    Returns metadata of all unique original documents based on stored chunks
    in the collection for debugging/display.
    """
    try:
        # Fetch all IDs first, then get with metadata
        # Fetch all metadatas to identify unique original documents
        all_chunk_data = collection.get(include=['metadatas'])
    
        if not all_chunk_data or not all_chunk_data['metadatas']:
            return jsonify([]) # No documents in collection

        unique_original_docs = {}
        for i, metadata in enumerate(all_chunk_data['metadatas']):
            original_filename = metadata.get('original_filename')
            if original_filename and original_filename not in unique_original_docs:
                unique_original_docs[original_filename] = {
                    # Use a consistent ID, perhaps derived from filename, or just use filename as key
                    "id": f"orig_doc_{original_filename.replace('.', '_').lower()}",
                    "filename": original_filename,
                    "user.status": metadata.get('user.status', 'N/A'), # From first encountered chunk
                    "user.approved_by": metadata.get('user.approved_by', 'N/A') # From first encountered chunk
                }
        
        return jsonify(list(unique_original_docs.values()))
    
    except Exception as e:
        print(f"Error fetching all documents metadata: {e}")
        return jsonify({"error": f"An error occurred while fetching document metadata: {str(e)}"}), 500

# --- File System Monitor ---
class DocumentChangeHandler(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory and event.src_path.endswith(".txt"):
            print(f"New document detected: {event.src_path}")
            process_document_and_store_chunks(event.src_path)

    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith(".txt"):
            print(f"Document modified: {event.src_path}")
            # Re-processing will delete old chunks and add new ones
            process_document_and_store_chunks(event.src_path)

def start_document_monitor():
    event_handler = DocumentChangeHandler()
    observer = Observer()
    observer.schedule(event_handler, DOCUMENTS_DIR, recursive=False) # Set recursive=True if subdirs are needed
    observer.daemon = True # Allow main program to exit when this script exits
    observer.start()
    print(f"Started monitoring directory '{DOCUMENTS_DIR}' for .txt file changes.")


if __name__ == '__main__':
    # Ensure the documents directory exists
    if not os.path.exists(DOCUMENTS_DIR):
        os.makedirs(DOCUMENTS_DIR)
        print(f"Created documents directory: {DOCUMENTS_DIR}")
        
    # Define content for dummy files, aligning with simulated_xattrs keys
    dummy_files_content = {
        "security_policy.txt": "This document outlines the final security policies and procedures approved by the security group. It covers access control, data encryption, and incident response. All personnel must adhere to these guidelines.",
        "privacy_policy_draft.txt": "This is a draft version of the privacy policy. It addresses data collection, usage, and user rights. This version is still under review by the legal team.",
        "old_hr_policy.txt": "This is an obsolete HR policy regarding remote work prior to 2020. A new policy was issued last year.",
        "marketing_brief_final.txt": "This is the final marketing brief for the Q3 campaign, approved by the marketing team. It details target audience and messaging.",
        "it_security_guidelines.txt": "These are the final IT security guidelines for server configuration and network hardening, approved by the security group. Adherence is mandatory.",
        "new_feature_spec_draft.txt": "This is a draft specification for the new 'User Dashboard' feature. It's currently being reviewed by the engineering team.",
        "compliance_report_final.txt": "This is the final annual compliance report, approved by the compliance department. It summarizes audit findings and regulatory adherence.",
        "wiske_approved_doc.txt": "This document is specifically approved by Wiske and has a final status. Suske should be able to see this."
    }

    # Create dummy files only if the documents directory is empty
    if not os.listdir(DOCUMENTS_DIR):
        print(f"Documents directory '{DOCUMENTS_DIR}' is empty. Creating dummy files...")
        for filename, content in dummy_files_content.items():
            filepath = os.path.join(DOCUMENTS_DIR, filename)
            # We already checked the directory is empty, so no need to check if file exists
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Created dummy file: {filepath}")
    else:
        print(f"Documents directory '{DOCUMENTS_DIR}' is not empty. Skipping dummy file creation.")

    # Sideload documents when the script starts
    # This will be triggered once the container starts and the Python app runs.
    sideload_documents_to_chroma()
    
    # Start monitoring the documents directory for new/modified files
    start_document_monitor()

    # Run Flask app
    app.run(host='0.0.0.0', port=5000, debug=False)
        