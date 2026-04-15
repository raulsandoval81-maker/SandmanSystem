const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

function openSystemTab(tabName){
  tabButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  tabPanels.forEach(panel => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    openSystemTab(btn.dataset.tab);
  });
});