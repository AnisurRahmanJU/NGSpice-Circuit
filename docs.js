(function(){var D=window.DOCS_DATA;
var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting){var c=x.target.closest(".tp");c._ready=true;load(c);io.unobserve(x.target)}})},{rootMargin:"400px"});
function load(c){var f=c.querySelector("iframe"),s=c.querySelector(".exs"),n=D[+c.dataset.i].items[+s.value].n,q="topic="+c.dataset.i+"&ex="+n;
 c.querySelector(".open").href="simulator/index.html?"+q;if(c._ready)f.src="simulator/index.html?embed=1&"+q}
document.querySelectorAll(".tp").forEach(function(c){var s=c.querySelector(".exs");
 D[+c.dataset.i].items.forEach(function(it,k){s.add(new Option(it.n+". "+it.t,k))});
 s.onchange=function(){load(c)};load(c);io.observe(c.querySelector(".frame"))});
})();