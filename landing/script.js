function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const clock = document.getElementById("clock");
  if (clock) {
    clock.textContent = `${hours}:${minutes}:${seconds}`;
  }
}

function wireCopyButtons() {
  const buttons = document.querySelectorAll(".copy-button");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.getAttribute("data-copy-target");
      if (!targetId) return;

      const target = document.getElementById(targetId);
      if (!target) return;

      const text = target.textContent ?? "";
      try {
        await navigator.clipboard.writeText(text.trim());
        const originalText = button.textContent;
        button.textContent = "COPIED";
        button.classList.add("copied");
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove("copied");
        }, 1200);
      } catch {
        button.textContent = "FAILED";
        setTimeout(() => {
          button.textContent = "COPY";
        }, 1200);
      }
    });
  });
}

function addCardTilt() {
  const cards = document.querySelectorAll(".card");
  const disableTilt = window.matchMedia("(max-width: 760px)").matches;
  cards.forEach((card) => {
    if (card.classList.contains("text-only")) return;
    if (disableTilt) {
      card.style.setProperty("--tilt-rotation", "0deg");
      return;
    }

    const rotation = (Math.random() * 2 - 1).toFixed(2);
    card.style.setProperty("--tilt-rotation", `${rotation}deg`);
  });
}

updateClock();
setInterval(updateClock, 1000);
wireCopyButtons();
addCardTilt();
window.addEventListener("resize", addCardTilt);
