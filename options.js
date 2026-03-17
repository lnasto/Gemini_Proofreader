// Save
document.getElementById('save').addEventListener('click', () => {
  const settings = {
    apiKey: document.getElementById('apiKey').value,
    enableAnalysis: document.getElementById('enableAnalysis').checked,
    enableProf: document.getElementById('enableProf').checked,
    enableCasual: document.getElementById('enableCasual').checked,
    enableTrans: document.getElementById('enableTrans').checked,
    shortcutAction: document.getElementById('shortcutAction').value
  };

  chrome.storage.local.set(settings, () => {
    const status = document.getElementById('status');
    status.textContent = 'Settings saved! ✅';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});

document.getElementById('openShortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// Load
chrome.storage.local.get(null, (res) => {
  document.getElementById('apiKey').value = res.apiKey || '';
  document.getElementById('enableAnalysis').checked = res.enableAnalysis !== false;
  document.getElementById('enableProf').checked = res.enableProf !== false;
  document.getElementById('enableCasual').checked = res.enableCasual !== false;
  document.getElementById('enableTrans').checked = res.enableTrans !== false;
  if (res.shortcutAction) document.getElementById('shortcutAction').value = res.shortcutAction;
});