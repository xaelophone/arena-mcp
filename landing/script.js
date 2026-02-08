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

wireCopyButtons();
