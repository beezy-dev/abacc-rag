import React, { useState, useEffect } from 'react';

function App() {
    const [userQuery, setUserQuery] = useState('');
    const [llmResponse, setLlmResponse] = useState('');
    const [displayedFilteredDocs, setDisplayedFilteredDocs] = useState([]);
    const [allBackendDocuments, setAllBackendDocuments] = useState([]); // To display all documents known by backend
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentUser, setCurrentUser] = useState('Wiske'); // Default user

    // Point to the backend service name and port within the Podman network
    // 'backend' is the service name defined in podman-compose.yaml
    const BACKEND_API_URL = 'http://localhost:5000/api'; // From browser perspective, talk to host mapped port
    // Point to the Ollama service name and port within the Podman network
    // 'ollama' is the service name defined in podman-compose.yaml
    const OLLAMA_LLM_API_URL = 'http://localhost:11434/api/generate'; // From browser perspective, talk to host mapped port
    const OLLAMA_LLM_MODEL = 'gemma3:1b'; // Ensure this model is pulled in Ollama

    // Fetch all documents metadata from backend on component mount for display
    useEffect(() => {
        const fetchAllDocuments = async () => {
            try {
                const response = await fetch(`${BACKEND_API_URL}/documents`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setAllBackendDocuments(data);
            } catch (err) {
                console.error("Error fetching all documents metadata:", err);
                // setError(`Failed to load document metadata: ${err.message}`); // Optional: show this error
            }
        };
        fetchAllDocuments();
    }, []);

    // Function to handle the search and LLM response generation
    const handleSearch = async () => {
        setIsLoading(true);
        setLlmResponse('');
        setDisplayedFilteredDocs([]);
        setError('');

        if (!userQuery.trim()) {
            setError("Please enter a query.");
            setIsLoading(false);
            return;
        }

        try {
            // Step 1: Call Python backend to get semantically relevant and filtered documents
            // This step still attempts to find context.
            const backendResponse = await fetch(`${BACKEND_API_URL}/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: userQuery,
                    user: currentUser // Send the current user
                    // Backend will now determine filters based on this user
                }),
            });

            if (!backendResponse.ok) {
                const errorData = await backendResponse.json();
                // If backend search fails for some reason, we'll still try to prompt the LLM directly
                console.warn(`Backend search failed: ${errorData.error || backendResponse.statusText}. Attempting direct LLM prompt.`);
                // Don't throw here, allow to proceed to direct LLM call
                setDisplayedFilteredDocs([]); // Clear any previous filtered docs if search failed
            }

            const filteredDocuments = backendResponse.ok ? await backendResponse.json() : [];
            setDisplayedFilteredDocs(filteredDocuments);

            console.log("Documents fetched from backend (filtered by xattr):", 
                filteredDocuments.map(d => ({filename: d.original_filename || d.filename, status: d['user.status'], approvedBy: d['user.approved_by'] }))
            );

            // Step 2: Pass filtered document content to Ollama LLM, or just the query if no docs
            const llmGeneratedResponse = await getLlmResponseFromOllama(userQuery, filteredDocuments);
            setLlmResponse(llmGeneratedResponse);

        } catch (err) {
            console.error("Error during search process:", err);
            setError(`Error: ${err.message}. Please check if the Python backend and Ollama are running and accessible.`);
        } finally {
            setIsLoading(false);
        }
    };

    // Function to make the actual Ollama LLM call
    const getLlmResponseFromOllama = async (query, contextDocuments) => {
        let prompt;

        // If context documents are available, construct a RAG-style prompt
        if (contextDocuments.length > 0) {
            const contextString = contextDocuments.map(doc =>
                `--- Document: ${doc.original_filename || doc.filename} (Status: ${doc['user.status']}, Approved By: ${doc['user.approved_by']}) ---\n${doc.content}`
            ).join('\n\n');
            prompt = `Based on the following documents, answer the question: "${query}"\n\nDocuments:\n${contextString}\n\nResponse:`;
        } else {
            // If no context documents, just prompt the LLM with the user's query
            prompt = `Answer the following question: "${query}"`;
        }

        try {
            const response = await fetch(OLLAMA_LLM_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: OLLAMA_LLM_MODEL,
                    prompt: prompt,
                    stream: false, // We want a single response, not a stream
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Ollama LLM HTTP error! status: ${response.status}. Response: ${errorBody}`);
            }

            const result = await response.json();
            if (result.response) {
                return result.response;
            } else {
                console.error("Unexpected Ollama LLM response structure:", result);
                return "An error occurred while generating the response from the LLM.";
            }
        } catch (ollamaErr) {
            console.error("Error calling Ollama LLM API:", ollamaErr);
            // Propagate error to be displayed by setError in handleSearch
            throw new Error(`Failed to connect to Ollama LLM or get a response. Error: ${ollamaErr.message}`);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-inter">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl">
                <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
                    ABAC for Douments for LLM Context
                </h1>

                <p className="text-gray-600 mb-6 text-center">
                    Context prompting extended attribute awareness.
                    <br />
                    <b>Suske</b> sees documents with <i>status='final'</i> AND <i>approved_by='Wiske'</i>.
                    <br />
                    <b>Wiske</b> sees all documents.
                </p>

                <div className="mb-6 flex justify-center space-x-4">
                    <button
                        onClick={() => setCurrentUser('Suske')}
                        className={`px-4 py-2 rounded-lg font-semibold ${currentUser === 'Suske' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        Act as Suske
                    </button>
                    <button
                        onClick={() => setCurrentUser('Wiske')}
                        className={`px-4 py-2 rounded-lg font-semibold ${currentUser === 'Wiske' ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        Act as Wiske
                    </button>
                </div>

                <p className="text-center text-sm text-gray-500 mb-4">Currently acting as: <span className="font-bold text-indigo-600">{currentUser}</span></p>

                <p className="text-gray-600 mb-6 text-center">
                    <br/>
                    <span className="font-semibold text-blue-600">
                        (Note: The LLM will still attempt to respond even if no matching documents are found.)
                    </span>
                </p>

                <div className="mb-4">
                    <label htmlFor="userQuery" className="block text-gray-700 text-sm font-bold mb-2">
                        Your Query:
                    </label>
                    <input
                        type="text"
                        id="userQuery"
                        className="shadow appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., What are the security policies?"
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        onKeyPress={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        disabled={isLoading}
                    />
                </div>

                <button
                    onClick={handleSearch}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-300 ease-in-out transform hover:scale-105"
                    disabled={isLoading}
                >
                    {isLoading ? 'Processing...' : 'Search & Get LLM Response'}
                </button>

                {error && (
                    <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg" role="alert">
                        <p className="font-bold">Error:</p>
                        <p>{error}</p>
                    </div>
                )}

                {isLoading && (
                    <div className="flex justify-center items-center mt-6">
                        <div className="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12 mb-4"></div>
                        <style>{`
                            .loader {
                                border-top-color: #3498db;
                                -webkit-animation: spinner 1.5s linear infinite;
                                animation: spinner 1.5s linear infinite;
                            }
                            @-webkit-keyframes spinner {
                                0% { -webkit-transform: rotate(0deg); }
                                100% { -webkit-transform: rotate(360deg); }
                            }
                            @keyframes spinner {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                )}

                {displayedFilteredDocs.length > 0 && !isLoading && !error && (
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h2 className="text-lg font-semibold text-blue-800 mb-2">
                            Documents Found & Used as LLM Context (for {currentUser}):
                        </h2>
                        <ul className="list-disc list-inside text-gray-700">
                            {displayedFilteredDocs.map(doc => (
                                <li key={doc.id} className="mb-1">
                                    <span className="font-medium">{doc.filename}</span>
                                    <span className="text-sm text-gray-500 ml-2">
                                        (Status: {doc['user.status']}, Approved By: {doc['user.approved_by']})
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {llmResponse && !isLoading && !error && (
                    <div className="mt-6 p-6 bg-green-50 border border-green-200 rounded-lg shadow-md">
                        <h2 className="text-xl font-semibold text-green-800 mb-3">
                            LLM Response:
                        </h2>
                        <p className="text-gray-800 whitespace-pre-wrap">
                            {llmResponse}
                        </p>
                    </div>
                )}

                {/* This message shows if no documents were found for context, but an LLM response was generated */}
                {displayedFilteredDocs.length === 0 && llmResponse && !isLoading && !error && (
                    <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-yellow-800">
                            No documents matching {currentUser}'s access criteria were found relevant to your query.
                            The LLM will attempt to answer your query directly.
                        </p>
                    </div>
                )}

                <div className="mt-8 text-sm text-gray-500 text-center">
                    <h3 className="font-semibold mb-2">All Documents known by Backend:</h3>
                    {allBackendDocuments.length === 0 && !isLoading ? (
                        <p>No documents loaded in backend yet, or failed to fetch. Ensure backend is running and has sideloaded documents.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                            {allBackendDocuments.map(doc => (
                                <div key={doc.id} className="p-3 bg-gray-50 rounded-md border border-gray-200">
                                    <p className="font-medium text-gray-700">{doc.filename}</p>
                                    <p className="text-xs text-gray-600">Status: <span className="font-semibold">{doc['user.status']}</span></p>
                                    <p className="text-xs text-gray-600">Approved By: <span className="font-semibold">{doc['user.approved_by']}</span></p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;