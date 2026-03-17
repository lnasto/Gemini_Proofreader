// --- CONFIGURATION ---
const MODEL = "gemini-flash-latest"; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// --- MENU MANAGEMENT ---
async function updateMenus() {
  await chrome.contextMenus.removeAll();
  const res = await chrome.storage.local.get(null);

  chrome.contextMenus.create({ id: "geminiParent", title: "✨ Gemini Tools", contexts: ["selection"] });

  if (res.enableAnalysis !== false) 
    chrome.contextMenus.create({ id: "geminiAnalysis", parentId: "geminiParent", title: "🔍 Proofread & Fix", contexts: ["selection"] });
  if (res.enableProf !== false) 
    chrome.contextMenus.create({ id: "geminiProf", parentId: "geminiParent", title: "👔 Formal Tone", contexts: ["selection"] });
  if (res.enableCasual !== false) 
    chrome.contextMenus.create({ id: "geminiCasual", parentId: "geminiParent", title: "👋 Casual Tone", contexts: ["selection"] });
  if (res.enableTrans !== false) 
    chrome.contextMenus.create({ id: "geminiTrans", parentId: "geminiParent", title: "🌍 Translate (EN)", contexts: ["selection"] });
}

chrome.runtime.onInstalled.addListener(updateMenus);
chrome.storage.onChanged.addListener(updateMenus);

// --- API CORE ---
async function callGemini(prompt, tabId, retryCount = 0) {
  const res = await chrome.storage.local.get(['apiKey']);
  if (!res.apiKey) {
    chrome.scripting.executeScript({ target: { tabId }, func: () => alert("Error: Please set your API Key in the extension options!") }).catch(() => {});
    return;
  }

  const loadingMsg = retryCount > 0 ? `Attempt ${retryCount + 1}/3 (Quota Wait)...` : "...Thinking...";
  chrome.scripting.executeScript({ target: { tabId }, func: displayPopup, args: [loadingMsg, true] }).catch(() => {});

  try {
    const response = await fetch(`${API_URL}?key=${res.apiKey}`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
            temperature: 0.1,
            maxOutputTokens: 2048, 
        }
      })
    });

    const data = await response.json();

    if (data.error && data.error.code === 429 && retryCount < 2) {
      const waitTime = (retryCount + 1) * 5000; 
      await new Promise(r => setTimeout(r, waitTime));
      return callGemini(prompt, tabId, retryCount + 1);
    }

    if (data.error) throw new Error(data.error.message);

    const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!result) throw new Error("No response received from AI. Check your text.");

    chrome.scripting.executeScript({ target: { tabId }, func: displayPopup, args: [result, false] }).catch(() => {});

  } catch (error) {
    let msg = error.message;
    if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
        msg = "The API is temporarily busy. Please try again in 15 seconds.";
    }
    chrome.scripting.executeScript({ target: { tabId }, func: displayPopup, args: ["Error: " + msg, false] }).catch(() => {});
  }
}

// --- EVENT LISTENERS ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Ασφάλεια: Ακύρωση σε απαγορευμένες σελίδες
  if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.includes("chrome.google.com/webstore")) {
      return;
  }

  let prompt = "";
  const baseInstr = "DO NOT TRUNCATE OR SUMMARIZE the text. Return ALL sentences intact. Respond STRICTLY with this structure:\n[FIXED]\n(the entire text here)\n[ERRORS]\n(what was corrected). ";
  
  if (info.menuItemId === "geminiAnalysis") {
    prompt = `${baseInstr} Correct spelling/grammar for the following: "${info.selectionText}"`;
  } else if (info.menuItemId === "geminiProf") {
    prompt = `${baseInstr} Rewrite formally: "${info.selectionText}"`;
  } else if (info.menuItemId === "geminiCasual") {
    prompt = `${baseInstr} Rewrite casually: "${info.selectionText}"`;
  } else if (info.menuItemId === "geminiTrans") {
    prompt = `${baseInstr} Translate to English: "${info.selectionText}"`;
  }

  if (prompt) callGemini(prompt, tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "run-gemini-analysis") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Ασφάλεια: Ακύρωση σε απαγορευμένες σελίδες συστήματος Chrome
    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.includes("chrome.google.com/webstore")) {
        console.warn("Gemini AI: Cannot run on restricted browser pages.");
        return;
    }

    chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.getSelection().toString() }, async (results) => {
      // Clear lastError silently if execution fails for some other reason
      if (chrome.runtime.lastError) return;

      if (results?.[0]?.result) {
        const text = results[0].result;
        const res = await chrome.storage.local.get(['shortcutAction']);
        let action = res.shortcutAction || "geminiAnalysis";

        if (action === "ask") {
          const promptRes = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              return new Promise((resolve) => {
                const existing = document.getElementById("gemini-action-modal");
                if (existing) existing.remove();

                const modal = document.createElement("div");
                modal.id = "gemini-action-modal";
                modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:2147483647; display:flex; justify-content:center; align-items:center; font-family:'Segoe UI', Tahoma, sans-serif; backdrop-filter:blur(2px);";
                
                const box = document.createElement("div");
                box.style.cssText = "background:white; padding:20px; border-radius:12px; width:320px; box-shadow:0 10px 40px rgba(0,0,0,0.3); display:flex; flex-direction:column; gap:10px;";
                
                box.innerHTML = `
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                    <b style="color:#1a73e8; font-size:16px;">✨ Choose Action</b>
                    <button id="gem-cancel" style="background:none; border:none; font-size:22px; cursor:pointer; color:#999; padding:0; line-height:1;">&times;</button>
                  </div>
                  <button id="gem-opt-1" style="padding:12px; text-align:left; background:#f8f9fa; border:1px solid #e8eaed; border-radius:8px; cursor:pointer; font-size:14px; font-weight:500; color:#333; transition:background 0.2s;">🔍 Proofread & Fix</button>
                  <button id="gem-opt-2" style="padding:12px; text-align:left; background:#f8f9fa; border:1px solid #e8eaed; border-radius:8px; cursor:pointer; font-size:14px; font-weight:500; color:#333; transition:background 0.2s;">👔 Formal Tone</button>
                  <button id="gem-opt-3" style="padding:12px; text-align:left; background:#f8f9fa; border:1px solid #e8eaed; border-radius:8px; cursor:pointer; font-size:14px; font-weight:500; color:#333; transition:background 0.2s;">👋 Casual Tone</button>
                  <button id="gem-opt-4" style="padding:12px; text-align:left; background:#f8f9fa; border:1px solid #e8eaed; border-radius:8px; cursor:pointer; font-size:14px; font-weight:500; color:#333; transition:background 0.2s;">🌍 Translate (EN)</button>
                `;
                
                modal.appendChild(box);
                document.body.appendChild(modal);

                const btns = box.querySelectorAll('button[id^="gem-opt"]');
                btns.forEach(btn => {
                  btn.onmouseover = () => btn.style.background = '#e8f0fe';
                  btn.onmouseout = () => btn.style.background = '#f8f9fa';
                });

                document.getElementById("gem-opt-1").onclick = () => { modal.remove(); resolve("geminiAnalysis"); };
                document.getElementById("gem-opt-2").onclick = () => { modal.remove(); resolve("geminiProf"); };
                document.getElementById("gem-opt-3").onclick = () => { modal.remove(); resolve("geminiCasual"); };
                document.getElementById("gem-opt-4").onclick = () => { modal.remove(); resolve("geminiTrans"); };
                document.getElementById("gem-cancel").onclick = () => { modal.remove(); resolve(null); };
              });
            }
          });
          
          if (chrome.runtime.lastError) return;
          action = promptRes?.[0]?.result;
          if (!action) return; 
        }

        const baseInstr = "DO NOT TRUNCATE OR SUMMARIZE the text. Return ALL sentences intact. Respond STRICTLY with this structure:\n[FIXED]\n(the entire text here)\n[ERRORS]\n(what was corrected). ";
        let finalPrompt = "";
        
        if (action === "geminiAnalysis") finalPrompt = `${baseInstr} Correct spelling/grammar: "${text}"`;
        else if (action === "geminiProf") finalPrompt = `${baseInstr} Rewrite formally: "${text}"`;
        else if (action === "geminiCasual") finalPrompt = `${baseInstr} Rewrite casually: "${text}"`;
        else if (action === "geminiTrans") finalPrompt = `${baseInstr} Translate to English: "${text}"`;

        if (finalPrompt) callGemini(finalPrompt, tab.id);
      }
    });
  }
});

// --- UI INJECTION ---
function displayPopup(text, isLoading) {
  if (!isLoading && !text.startsWith("Error:")) {
    console.log("===== GEMINI DEBUG INFO =====");
    console.log("1. RAW AI TEXT:\n", text);
  }

  const old = document.getElementById("gemini-popup");
  if (old) old.remove();

  const div = document.createElement("div");
  div.id = "gemini-popup";
  div.style = "position:fixed; top:20px; right:20px; width:360px; background:white; border-radius:12px; border:2px solid #1a73e8; box-shadow:0 10px 40px rgba(0,0,0,0.4); z-index:1000000; padding:15px; font-family:sans-serif; color:#333;";

  if (isLoading) {
    div.innerHTML = `<div style="display:flex; align-items:center; gap:10px; color:#1a73e8;">
      <div style="width:14px; height:14px; border:2px solid #e8f0fe; border-top:2px solid #1a73e8; border-radius:50%; animation: spin 1s linear infinite;"></div>
      <span style="font-size:14px; font-weight:500;">${text}</span>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    </div>`;
  } else if (text.startsWith("Error:")) {
    div.style.borderColor = "#d93025";
    div.innerHTML = `<div style="color:#d93025; font-size:13px; font-weight:bold; margin-bottom:8px;">⚠️ Problem</div>
                     <div style="font-size:13px; color:#555; line-height:1.4;">${text}</div>
                     <button id="close-pop" style="margin-top:12px; width:100%; padding:8px; background:#fce8e6; color:#d93025; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Close</button>`;
  } else {
    const cleanText = text.replace(/\*\*/g, ""); 
    const parts = cleanText.split(/\[ERRORS\]|ERRORS:|===ERRORS===/i);
    
    const corrected = parts[0].replace(/\[FIXED\]|FIXED:|===FIXED===/i, "").trim();
    const errors = parts.length > 1 ? parts[1].trim() : "No specific errors found.";

    console.log("2. EXTRACTED CORRECTED TEXT:\n", corrected);
    console.log("3. EXTRACTED ERRORS:\n", errors);
    console.log("=============================");

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><b style="color:#1a73e8; font-size:14px;">✨ Gemini AI</b><button id="close-pop" style="border:none; background:none; cursor:pointer; font-size:20px; color:#999;">&times;</button></div>
      <div style="background:#f1f8ff; padding:12px; border-radius:8px; font-size:14px; border:1px solid #c2e0ff; margin-bottom:12px; line-height:1.5; max-height: 250px; overflow-y: auto;">${corrected}</div>
      <div style="display:flex; gap:8px; margin-bottom:12px;">
        <button id="copy-btn" style="flex:1; padding:10px; background:#1a73e8; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">Copy</button>
        <button id="replace-btn" style="flex:1; padding:10px; background:#e8f0fe; color:#1a73e8; border:1px solid #1a73e8; border-radius:6px; cursor:pointer; font-weight:bold;">Replace</button>
      </div>
      <div style="font-size:11px; color:#666; border-top:1px solid #eee; padding-top:10px;"><b>Notes:</b><br>${errors}</div>
    `;
  }

  document.body.appendChild(div);
  
  const closeBtn = document.getElementById("close-pop");
  if (closeBtn) closeBtn.onclick = () => div.remove();

  if (!isLoading && !text.startsWith("Error:")) {
    const cleanTextBtn = text.replace(/\*\*/g, ""); 
    const partsBtn = cleanTextBtn.split(/\[ERRORS\]|ERRORS:|===ERRORS===/i);
    const finalCorrected = partsBtn[0].replace(/\[FIXED\]|FIXED:|===FIXED===/i, "").trim();

    document.getElementById("copy-btn").onclick = () => {
      navigator.clipboard.writeText(finalCorrected);
      document.getElementById("copy-btn").innerText = "Copied! ✅";
      setTimeout(() => div.remove(), 1000);
    };

    document.getElementById("replace-btn").onclick = () => {
      const el = document.activeElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.value = finalCorrected;
      } else if (el.isContentEditable) {
        el.innerText = finalCorrected;
      } else {
        alert("No text field found for auto-replace.");
      }
      div.remove();
    };
  }
}