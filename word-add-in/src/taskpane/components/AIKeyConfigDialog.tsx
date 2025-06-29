import { Input, Modal, Select } from "antd";
import React, { useState } from "react";

export interface ApiKeyConfigProps {
  isOpen: boolean;
  apiKey: string;
  endpoint: string;
  deployment: string;
  provider: string; // NEW
  setKey: (key: string) => void;
  setEndpoint: (endpoint: string) => void;
  setDeployment: (deployment: string) => void;
  setProvider: (provider: string) => void; // NEW
  setOpen: (isOpen: boolean) => void;
  setInputSearch?: (endpoint: string) => void; // <-- Add this line
}

export interface ApiKeyConfigState {
  inputKey: string;
  inputEndpoint: string;
  inputDeployment: string;
}

export default function AIKeyConfigDialog(props: ApiKeyConfigProps) {
  const [inputKey, setInputKey] = useState(props.apiKey);
  const [inputEndpoint, setInputEndpoint] = useState(props.endpoint);
  const [inputDeployment, setInputDeployment] = useState(props.deployment);
  const [inputProvider, setInputProvider] = useState(props.provider || "openai");
  const [inputSearch, setInputSearch] = useState("http://localhost:5000/api/search");

  // Set provider-specific defaults
  React.useEffect(() => {
    if (props.isOpen) {
      if (inputProvider === "ollama") {
        if (!inputEndpoint) setInputEndpoint("http://127.0.0.1:11434");
        if (!inputDeployment) setInputDeployment("smollm2:135m");
      } else if (inputProvider === "openai") {
        if (!inputEndpoint) setInputEndpoint("https://api.openai.com/v1/responses");
        if (!inputDeployment) setInputDeployment("GPT-4.1");
      } else if (inputProvider === "abacc") {
        setInputEndpoint("http://localhost:5000/api/search");
        setInputDeployment(""); // No model for ABACC
        setInputKey(""); // No API key for ABACC
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.isOpen, inputProvider]);

  const handleOk = () => {
    // Only require API key if provider is not ollama, abacc, or abacc-ollama
    if (
      inputProvider !== "ollama" &&
      inputProvider !== "abacc" &&
      inputProvider !== "abacc-ollama" &&
      inputKey.length === 0
    ) {
      // Optionally, you can show a warning here if desired
      return;
    }
    // Always set key, endpoint, deployment, provider
    props.setKey(inputKey);
    if (inputEndpoint.length > 0) {
      props.setEndpoint(inputEndpoint);
    }
    // Only set deployment if not abacc or abacc-ollama
    if (
      inputProvider !== "abacc" &&
      inputProvider !== "abacc-ollama" &&
      inputDeployment.length > 0
    ) {
      props.setDeployment(inputDeployment);
    } else if (
      inputProvider === "abacc" ||
      inputProvider === "abacc-ollama"
    ) {
      props.setDeployment(""); // Clear deployment for abacc and abacc-ollama
    }
    if (inputProvider.length > 0) {
      props.setProvider(inputProvider);
    }
    props.setOpen(false);
  };

  const handleCancel = () => {
    props.setOpen(false);
  };

  const handleProviderChange = (value: string) => {
    setInputProvider(value);
    if (value === "ollama") {
      setInputEndpoint("http://127.0.0.1:11434");
      setInputDeployment("smollm2:135m");
      setInputKey("");
    } else if (value === "openai") {
      setInputEndpoint("https://api.openai.com/v1/responses");
      setInputDeployment("GPT-4.1");
      setInputKey("");
    } else if (value === "abacc") {
      setInputEndpoint("http://localhost:5000/api/search");
      setInputDeployment(""); // No model for ABACC
      setInputKey("");
    } else if (value === "abacc-ollama") {
      setInputEndpoint("http://127.0.0.1:11434"); // Ollama endpoint
      setInputDeployment("smollm2:135m");
      setInputKey("");
      setInputSearch("http://localhost:5000/api/search"); // <-- Add this line
    } else {
      setInputEndpoint("");
      setInputDeployment("");
      setInputKey("");
      setInputSearch && setInputSearch(""); // Defensive: clear if exists
    }
  };

  // Model options for each provider
  const openaiModels = ["GPT-4.1", "GPT-4o", "04-mini"];
  const ollamaModels = ["smollm2:135m"];

  return (
    <>
      <Modal title="Connect to AI Service" open={props.isOpen} onOk={handleOk} onCancel={handleCancel}>
        <label>Provider</label>
        <Select value={inputProvider} onChange={handleProviderChange} style={{ width: "100%", marginBottom: 8 }}>
          <Select.Option value="abacc">ABACC API</Select.Option>
          <Select.Option value="abacc-ollama">ABACC Ollama Endpoint</Select.Option>
          <Select.Option value="ollama">Ollama Compatible API</Select.Option>
          <Select.Option value="openai">OpenAI Compatible API</Select.Option>
        </Select>
        {/* Only show ABACC Search Endpoint for abacc and abacc-ollama */}
        {(inputProvider === "abacc" || inputProvider === "abacc-ollama") ? (
          <>
            <label>ABACC Search Endpoint</label>
            <Input value={inputSearch} onChange={e => setInputSearch(e.target.value)} />
            {inputProvider === "abacc" && (
              <div style={{ color: "#888", marginTop: 8 }}>
                No API key or model required for ABACC.
              </div>
            )}
          </>
        ) : (
          <>
            <label>Endpoint</label>
            <Input value={inputEndpoint} onChange={(e) => setInputEndpoint(e.target.value)} />
            <label>Deployment / Model</label>
            <Select
              value={inputDeployment}
              onChange={setInputDeployment}
              style={{ width: "100%", marginBottom: 8 }}
            >
              {(inputProvider === "openai"
                ? openaiModels
                : ollamaModels
              ).map((model) => (
                <Select.Option key={model} value={model}>
                  {model}
                </Select.Option>
              ))}
            </Select>
            {/* Only show API key if not Ollama */}
            {inputProvider !== "ollama" && (
              <>
                <label>API Key</label>
                <Input
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                />
              </>
            )}
            {/* Ollama info */}
            {inputProvider === "ollama" && (
              <div style={{ color: "#888", marginTop: 8 }}>
                API key not required for Ollama.
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

