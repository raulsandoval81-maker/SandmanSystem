document.addEventListener(
  "click",
  async (event) => {
    const button =
      event.target.closest("[data-copy-url]");

    if (!button) {
      return;
    }

    const url =
      button.dataset.copyUrl;

    try {
      await navigator.clipboard.writeText(url);

      const original =
        button.textContent;

      button.textContent =
        "Copied ✓";

      button.classList.add(
        "is-copied"
      );

      window.setTimeout(() => {
        button.textContent =
          original;

        button.classList.remove(
          "is-copied"
        );
      }, 1600);
    } catch (error) {
      console.error(
        "Could not copy link:",
        error
      );

      button.textContent =
        "Copy failed";
    }
  }
);
