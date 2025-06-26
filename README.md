# ABACC RAG

ABACC RAG stands for Attribute-Based Access Controlled Context for Retrieval-Augmented Generation fostering an organization-level AI sovereignty.

Most of the retrieval examples usually consider the user to feed the LLM with a series of documents that they deemed relevant to their prompting activity.
While this approach has a direct value for a single user, it isn't at an organizational level. However, the most complex challenge with organization-wide knowledge is **who can access what, from where, and when**. 

The ABACC RAG illustrates the ability to leverage enriched metadata, with, in this example, the usage of extended attributes at a Unix/Linux file system level, or managed at scale with a third-party enterprise solution like [NetApp BlueXP Classification](https://docs.netapp.com/us-en/bluexp-classification/concept-cloud-compliance.html). 

## Overview

ABACC RAG was prototype to showcase a Copilot for Microsoft Office 365 replacement with an organization-level AI sovereignty architecture. 

The components are:
- a Python backend:
    - ingesting data and metadata (including extended attributes) from a given directory in ChromaDB 
    - retrieving an ingested document list via an API endpoint
    - retrieving context filtered by the attribute-based access control and submit the context and prompt to the model via an API endpoint 
- a web frontend for a classic off-application chatbot 
- a Microsoft Word Add-in for in-application chat and insertion 

For more details, you can go through [the documentation](DOCS/README.md)


