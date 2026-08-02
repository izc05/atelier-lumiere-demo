const statusElement = document.querySelector("#api-status");

async function checkApi() {
  try {
    const response = await fetch("/internal/api-health", {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const health = await response.json();
    statusElement.textContent = `API operativa · ${health.version}`;
    statusElement.className = "status ok";
  } catch {
    statusElement.textContent = "API sin conexión";
    statusElement.className = "status error";
  }
}

void checkApi();
