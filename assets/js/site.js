document.querySelectorAll('.code .copy').forEach(function (b) {
  b.addEventListener('click', function () {
    var t = b.parentElement.querySelector('pre').innerText;
    navigator.clipboard.writeText(t).then(function () { b.textContent = 'Copied'; b.classList.add('done');
      setTimeout(function () { b.textContent = 'Copy'; b.classList.remove('done'); }, 1500); });
  });
});
var links = Array.prototype.slice.call(document.querySelectorAll('.side a'));
var io = new IntersectionObserver(function (es) {
  es.forEach(function (e) {
    if (e.isIntersecting) {
      links.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id); });
    }
  });
}, { rootMargin: '-40% 0px -55% 0px' });
document.querySelectorAll('main section[id]').forEach(function (s) { io.observe(s); });
