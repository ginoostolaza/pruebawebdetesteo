document.addEventListener("DOMContentLoaded", function () {
  const footerContainer = document.getElementById("footer");

  if (footerContainer) {
    fetch("assets/components/footer.html")
      .then(response => response.text())
      .then(data => {
        footerContainer.innerHTML = data;
      })
      .catch(error => console.error("Error cargando el footer:", error));
  }
});
