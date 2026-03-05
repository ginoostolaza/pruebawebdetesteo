document.addEventListener("DOMContentLoaded", function () {
  const footerContainer = document.getElementById("footer");

  if (footerContainer) {
    fetch("assets/components/footer.html")
      .then(response => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(data => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        while (footerContainer.firstChild) footerContainer.removeChild(footerContainer.firstChild);
        Array.from(doc.body.childNodes).forEach(node => {
          footerContainer.appendChild(document.importNode(node, true));
        });
        const yearEl = document.getElementById("anio-actual");
        if (yearEl) yearEl.textContent = new Date().getFullYear();
      })
      .catch(error => console.error("Error cargando el footer:", error));
  }
});
