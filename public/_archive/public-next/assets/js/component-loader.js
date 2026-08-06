/**
 * Sandman Combat shared component loader.
 *
 * Loads HTML fragments declared with:
 *
 *   <div data-component="/components/navigation.html"></div>
 *
 * After all components load, it dispatches:
 *
 *   components:loaded
 */

document.addEventListener("DOMContentLoaded", async () => {
  const componentTargets = document.querySelectorAll("[data-component]");

  for (const target of componentTargets) {
    const componentPath = target.getAttribute("data-component");

    if (!componentPath) continue;

    try {
      const response = await fetch(componentPath);

      if (!response.ok) {
        throw new Error(
          `Unable to load ${componentPath}: ${response.status}`
        );
      }

      target.innerHTML = await response.text();

      /*
       * Tell navigation, language, and theme scripts that
       * a shared component has been inserted into the page.
       */
      document.dispatchEvent(
        new CustomEvent("sandman:component-loaded", {
          detail: {
            path: componentPath,
            target
          }
        })
      );
    } catch (error) {
      console.error(error);
    }
  }

  document.dispatchEvent(
    new CustomEvent("sandman:components-ready")
  );
});