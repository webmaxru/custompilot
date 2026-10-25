export function initSectionNavigation() {
  const links = [...document.querySelectorAll('[data-section-nav] a[href^="#"]')];
  const sections = links.map((link) => document.querySelector(link.getAttribute('href')));
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const offset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 92;
    let current = -1;
    sections.forEach((section, index) => {
      if (section && section.getBoundingClientRect().top <= offset + 24) current = index;
    });
    links.forEach((link, index) => {
      if (index === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(document.body);
  update();
}
