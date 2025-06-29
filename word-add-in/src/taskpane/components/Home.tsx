/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import React, { useState } from "react";
import { LeftOutlined, DownOutlined } from "@ant-design/icons";
import { Button, Dropdown, MenuProps, Space, Input, Select } from "antd";
import AIKeyConfigDialog from "./AIKeyConfigDialog";
import { generateText } from "./utility/AIData";

/* global Word, Office */

export default function Home() {
  const [displayMainFunc, setDisplayMainFunc] = useState(false);
  const [openKeyConfigDialog, setOpenKeyConfigDialog] = useState(false);
  const [titleLoading, setTitleLoading] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [citationLoading, setCitationLoading] = useState(false);
  const [pictureLoading, setPictureLoading] = useState(false);
  const [formatLoading, setFormatLoading] = useState(false);
  const [importTemplateLoading, setImportTemplateLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<{ prompt: string; generated: string; context?: string }[]>([]); // <-- FIXED

  // Set the default values of the API key, endpoint, and deployment of Azure OpenAI service.
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [deployment, setDeployment] = useState("");
  const [provider, setProvider] = useState("openai"); // NEW
  const [user, setUser] = useState("Suske"); // NEW

  // Add this state to store the ABACC search endpoint for abacc-ollama
  const [abaccSearchEndpoint, setAbaccSearchEndpoint] = useState("http://localhost:5000/api/search");

  const openMainFunc = () => {
    setDisplayMainFunc(true);
  };

  const back = () => {
    setDisplayMainFunc(false);
  };

  const open = (isOpen: boolean) => {
    setOpenKeyConfigDialog(isOpen);
  };

  const formatDocument = async () => {
    try {
      setFormatLoading(true);
      await Word.run(async (context) => {
        const firstPara = context.document.body.paragraphs.getFirst();
        let myLanguage = Office.context.displayLanguage;
        switch (myLanguage) {
          case "en-US":
            firstPara.style = "Heading 1";
            break;
          case "fr-FR":
            firstPara.style = "Titre 1";
            break;
          case "zh-CN":
            firstPara.style = "标题 1";
            break;
        }
        firstPara.alignment = "Centered";
        await context.sync();

        const paragraphs = context.document.body.paragraphs;
        paragraphs.load();
        await context.sync();
        for (let i = 1; i < paragraphs.items.length; i++) {
          if (paragraphs.items[i].style == "Subtitle") {
            paragraphs.items[i].style = "Heading 2";
            paragraphs.items[i].font.bold = true;
          }
        }
        await context.sync();

        const lists = context.document.body.lists;
        lists.load();
        await context.sync();
        for (let i = 0; i < lists.items.length; i++) {
          const list = lists.items[i];
          list.setLevelNumbering(0, Word.ListNumbering.upperRoman);
          const levelParas = list.getLevelParagraphs(0);
          levelParas.load();
          await context.sync();
          for (let j = 0; j < levelParas.items.length; j++) {
            const para = levelParas.items[j];
            para.font.bold = true;
          }
          await context.sync();
        }

        const pictures = context.document.body.inlinePictures;
        pictures.load();
        await context.sync();
        if (pictures.items.length > 0) {
          for (let k = 0; k < pictures.items.length; k++) {
            pictures.items[0].paragraph.alignment = "Centered";
            await context.sync();
          }
        }

        const tbdRanges = context.document.body.search("TBD", { matchCase: true });
        const doneRanges = context.document.body.search("DONE", { matchCase: true });
        tbdRanges.load();
        doneRanges.load();
        await context.sync();
        for (let i = 0; i < tbdRanges.items.length; i++) {
          tbdRanges.items[i].font.highlightColor = "yellow";
        }
        await context.sync();
        for (let i = 0; i < doneRanges.items.length; i++) {
          doneRanges.items[i].font.highlightColor = "Turquoise";
        }
        await context.sync();
      });
    } finally {
      setFormatLoading(false);
    }
  };

  const handleSend = async () => {
    if (!prompt) {
      return;
    }
    if (
      (provider === "openai" && (apiKey === "" || endpoint === "" || deployment === "")) ||
      (provider === "ollama" && (endpoint === "" || deployment === "")) ||
      (provider === "abacc" && endpoint === "") ||
      (provider === "abacc-ollama" && endpoint === "")
    ) {
      setOpenKeyConfigDialog(true);
      return;
    }
    try {
      setSendLoading(true);
      let generatedContent = "";
      let contextValue = "";

      if (provider === "abacc") {
        // Step 1: Query ABACC API for context
        const abaccRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: prompt, user }),
        });
        if (abaccRes.ok) {
          const abaccData = await abaccRes.json();
          contextValue = abaccData.response || abaccData.text || JSON.stringify(abaccData);
        } else {
          contextValue = "";
        }
        // Step 2: Query Ollama with context + user prompt
        const ollamaPrompt = contextValue
          ? `Context: ${contextValue}\n\nUser Query: ${prompt}`
          : prompt;
        generatedContent = await generateText(apiKey, "http://127.0.0.1:11434", "smollm2:135m", ollamaPrompt, 2000, "ollama");
        // Save both context and generated text in history
        setHistory([{ prompt, context: contextValue, generated: generatedContent }, ...history]);
      } else if (provider === "abacc-ollama") {
        // Step 1: Query ABACC API for context using abaccSearchEndpoint
        const abaccRes = await fetch(abaccSearchEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: prompt, user }),
        });
        let context = "";
        if (abaccRes.ok) {
          const abaccData = await abaccRes.json();
          context = abaccData.response || abaccData.text || JSON.stringify(abaccData);
        } else {
          context = "";
        }
        // Step 2: Query Ollama with context + user prompt
        const ollamaPrompt = context
          ? `Context: ${context}\n\nUser Query: ${prompt}`
          : prompt;
        generatedContent = await generateText(apiKey, endpoint, deployment, ollamaPrompt, 2000, "ollama");
        setHistory([{ prompt, generated: generatedContent }, ...history]);
      } else {
        generatedContent = await generateText(apiKey, endpoint, deployment, prompt, 2000, provider);
        setHistory([{ prompt, generated: generatedContent }, ...history]);
      }
      setPrompt("");
    } catch (error) {
      console.error(error);
    } finally {
      setSendLoading(false);
    }
  };

  const handleInsertGenerated = async (text: string) => {
    if (!text) return;
    await Word.run(async (context) => {
      const range = context.document.getSelection();
      range.insertText(text, Word.InsertLocation.replace);
      range.select();
      await context.sync();
    });
  };

  return (
    <>
      <div className="wrapper">
        <div className="main_content">
          {displayMainFunc ? (
            <>
              <div className="back">
                <div className="cursor" onClick={back}>
                  <LeftOutlined />
                  <span>Back</span>
                </div>
              </div>
              <Button loading={formatLoading} className="insert_button" onClick={formatDocument}>
                Format the document
              </Button>
              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <Input.TextArea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Or, type your own request to generate content..."
                  style={{ resize: "none", flexGrow: 1 }}
                />
                <Button type="primary" onClick={handleSend} loading={sendLoading}>
                  Send
                </Button>
                <Button onClick={() => setOpenKeyConfigDialog(true)}>
                  Configure
                </Button>
              </div>
              <AIKeyConfigDialog
                isOpen={openKeyConfigDialog}
                apiKey={apiKey}
                endpoint={endpoint}
                deployment={deployment}
                provider={provider}
                setOpen={open}
                setKey={setApiKey}
                setEndpoint={setEndpoint}
                setDeployment={setDeployment}
                setProvider={setProvider}
                setInputSearch={setAbaccSearchEndpoint}
              />
            </>
          ) : (
            <>
              <div className="header">
                <div className="header-title">
                  NetApp AI Data Connector Assistant
                </div>
                <div className="desc">
                  This sample add-in shows how to leverage inner AI service with data sovereignty at the organization level with NetApp Intelligent Data Infrastructure. <br />It allows you to generate content for your documents leveraging internally sourced models supported by NetApp M365 Connector enabling global knowledge search on your NetApp File realstate.
                  document.
                </div>
              </div>
              {/* Show user toggle for ABACC and ABACC Ollama */}
              {(provider === "abacc" || provider === "abacc-ollama") && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 0 0" }}>
                  <span style={{ fontWeight: 500 }}>User:</span>
                  <Select value={user} onChange={setUser} style={{ width: 120 }}>
                    <Select.Option value="Suske">Suske</Select.Option>
                    <Select.Option value="Wiske">Wiske</Select.Option>
                  </Select>
                </div>
              )}
              <div className="chatbot-prompt" style={{ marginTop: "32px" }}>
                <Input.TextArea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask the assistant to generate content for your document..."
                  style={{ resize: "none", flexGrow: 1 }}
                />
                <Button
                  type="primary"
                  onClick={handleSend}
                  loading={sendLoading}
                  style={{ marginTop: "8px", width: "49%" }}
                >
                  Send
                </Button>
                <Button
                  onClick={() => setOpenKeyConfigDialog(true)}
                  style={{ marginTop: "8px", width: "49%", marginLeft: "2%" }}
                >
                  Configure
                </Button>
                {/* Show history of requests and responses */}
                {history.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px", marginTop: "24px" }}>
                    {history.map((item, idx) => {
                      const promptLineCount = item.prompt.split(/\r\n|\r|\n/).length;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                            border: "1px solid #eee",
                            borderRadius: 8,
                            padding: 16,
                            background: "#fafbfc",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <label style={{ fontWeight: "bold", marginBottom: 4 }}>User Request</label>
                            <Input.TextArea
                              value={item.prompt}
                              readOnly
                              rows={promptLineCount}
                              style={{ background: "#f5f5f5", resize: "none" }}
                            />
                          </div>
                          {/* Show Context box only for abacc provider */}
                          {"context" in item && (
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              <label style={{ fontWeight: "bold", marginBottom: 4 }}>Context</label>
                              <Input.TextArea
                                value={item.context}
                                readOnly
                                rows={6}
                                style={{ background: "#f5f5f5", marginBottom: 8, resize: "none" }}
                              />
                            </div>
                          )}
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <label style={{ fontWeight: "bold", marginBottom: 4 }}>Generated Text</label>
                            <Input.TextArea
                              value={item.generated}
                              readOnly
                              rows={6}
                              style={{ background: "#f5f5f5", marginBottom: 8, resize: "none" }}
                            />
                            <Button
                              type="primary"
                              onClick={() => handleInsertGenerated(item.generated)}
                              disabled={!item.generated}
                              style={{ alignSelf: "flex-end" }}
                            >
                              Insert
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <AIKeyConfigDialog
                isOpen={openKeyConfigDialog}
                apiKey={apiKey}
                endpoint={endpoint}
                deployment={deployment}
                provider={provider}
                setOpen={open}
                setKey={setApiKey}
                setEndpoint={setEndpoint}
                setDeployment={setDeployment}
                setProvider={setProvider}
                setInputSearch={setAbaccSearchEndpoint}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
