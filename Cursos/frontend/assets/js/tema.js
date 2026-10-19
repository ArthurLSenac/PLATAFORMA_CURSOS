// Aplica o tema (claro/escuro) ANTES de a página ser desenhada, evitando "piscar".
// É um script comum (não-módulo) carregado no <head> de todas as páginas.
(function () {
    var tema = "escuro";
    try {
        var salvo = localStorage.getItem("tema");
        if (salvo === "claro" || salvo === "escuro") tema = salvo;
    } catch (e) { /* armazenamento indisponível */ }
    document.documentElement.setAttribute("data-tema", tema);
})();
