(function () {
  'use strict';

  var PRIMARY_NAV = [
    { label: '仪表盘', path: '/dashboard', icon: '01' },
    { label: '使用文档', path: '/knowledge', icon: '02' },
    { label: '流量商店', path: '/plan', icon: '03' },
    { label: '我的套餐', path: '/dashboard?section=subscription', icon: '04' },
    { label: '我的订单', path: '/order', icon: '05' },
    { label: '我的邀请', path: '/invite', icon: '06' },
    { label: '个人中心', path: '/profile', icon: '07' },
    { label: '我的工单', path: '/ticket', icon: '08' },
    { label: '流量明细', path: '/traffic', icon: '09' }
  ];
  var AUXILIARY_NAV = { label: '节点状态', path: '/node' };
  var LABEL_ALIASES = {
    '购买订阅': '流量商店',
    '我的订阅': '我的套餐'
  };
  var scheduled = false;
  var lastSubscriptionScroll = '';

  function hashRoute() {
    var value = window.location.hash.replace(/^#/, '') || '/dashboard';
    return value.charAt(0) === '/' ? value : '/' + value;
  }

  function routePath(route) {
    return route.split('?')[0].replace(/\/$/, '') || '/';
  }

  function activePath(item, route) {
    var current = routePath(route);
    if (item.label === '我的套餐') return current === '/dashboard' && route.indexOf('section=subscription') !== -1;
    if (item.label === '仪表盘') return current === '/dashboard' && route.indexOf('section=subscription') === -1;
    return current === item.path || current.indexOf(item.path + '/') === 0;
  }

  function makeLink(item) {
    var link = document.createElement('a');
    link.className = 'appgog-console-nav__link';
    link.href = '/#' + item.path;
    link.dataset.appgogNav = item.label;
    link.innerHTML = '<span class="appgog-console-nav__index" aria-hidden="true">' + item.icon + '</span><span>' + item.label + '</span>';
    return link;
  }

  function createNavigation(article) {
    var nav = document.createElement('nav');
    nav.className = 'appgog-console-nav';
    nav.setAttribute('aria-label', 'Xboard 用户控制台主导航');

    var brand = document.createElement('a');
    brand.className = 'appgog-console-nav__brand';
    brand.href = '/#/dashboard';
    brand.setAttribute('aria-label', 'APPGOG 控制台首页');
    brand.innerHTML = '<span class="appgog-console-nav__brand-mark" aria-hidden="true">A</span><span>APPGOG <small>CONSOLE</small></span>';
    nav.appendChild(brand);

    var scroller = document.createElement('div');
    scroller.className = 'appgog-console-nav__scroller';
    PRIMARY_NAV.forEach(function (item) { scroller.appendChild(makeLink(item)); });
    nav.appendChild(scroller);

    var auxiliary = document.createElement('a');
    auxiliary.className = 'appgog-console-nav__auxiliary';
    auxiliary.href = '/#' + AUXILIARY_NAV.path;
    auxiliary.textContent = AUXILIARY_NAV.label;
    auxiliary.title = '保留 Xboard 原生节点状态功能';
    nav.appendChild(auxiliary);

    var content = article.querySelector(':scope > section');
    article.insertBefore(nav, content || article.firstChild);
    return nav;
  }

  function createFooter(article) {
    var footer = document.createElement('footer');
    footer.className = 'appgog-console-footer';
    footer.setAttribute('aria-label', '控制台版权与会话状态');
    footer.innerHTML = '<span>© APPGOG</span><span class="appgog-console-footer__status"><i aria-hidden="true"></i>会话与业务数据由 Xboard 原生机制管理</span>';
    article.appendChild(footer);
    return footer;
  }

  function replaceExactLabels() {
    var nodes = document.querySelectorAll('.side-menu .n-menu-item-content-header, .n-breadcrumb, .n-card-header');
    nodes.forEach(function (root) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var original = node.nodeValue.trim();
        if (LABEL_ALIASES[original]) node.nodeValue = node.nodeValue.replace(original, LABEL_ALIASES[original]);
      }
    });
  }

  function identifyMain(article) {
    var main = article.querySelector(':scope > section');
    if (!main) return;
    main.id = 'appgog-main';
    main.setAttribute('role', 'main');
    main.setAttribute('tabindex', '-1');
  }

  function updateRouteState(nav) {
    var route = hashRoute();
    var page = routePath(route).split('/')[1] || 'dashboard';
    document.documentElement.dataset.appgogPage = page.replace(/[^a-z0-9-]/gi, '');
    nav.querySelectorAll('[data-appgog-nav]').forEach(function (link) {
      var item = PRIMARY_NAV.find(function (candidate) { return candidate.label === link.dataset.appgogNav; });
      var active = item && activePath(item, route);
      link.classList.toggle('is-active', Boolean(active));
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    var auxiliary = nav.querySelector('.appgog-console-nav__auxiliary');
    if (auxiliary) {
      var auxiliaryActive = routePath(route) === AUXILIARY_NAV.path;
      auxiliary.classList.toggle('is-active', auxiliaryActive);
      if (auxiliaryActive) auxiliary.setAttribute('aria-current', 'page');
      else auxiliary.removeAttribute('aria-current');
    }

    if (route.indexOf('/dashboard?section=subscription') === 0 && lastSubscriptionScroll !== route) {
      var headings = Array.from(document.querySelectorAll('.n-card-header, h1, h2, h3'));
      var heading = headings.find(function (element) { return /^(我的套餐|我的订阅)$/.test(element.textContent.trim()); });
      if (heading) {
        lastSubscriptionScroll = route;
        var target = heading.closest('.n-card') || heading;
        target.setAttribute('tabindex', '-1');
        target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        target.focus({ preventScroll: true });
      }
    }
  }

  function enhance() {
    scheduled = false;
    var article = document.querySelector('#app article');
    if (!article) return;
    var nav = article.querySelector(':scope > .appgog-console-nav') || createNavigation(article);
    if (!article.querySelector(':scope > .appgog-console-footer')) createFooter(article);
    identifyMain(article);
    replaceExactLabels();
    updateRouteState(nav);
    document.documentElement.classList.add('appgog-ready');
  }

  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhance);
  }

  var observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', function () {
    lastSubscriptionScroll = '';
    scheduleEnhance();
  });
  window.addEventListener('popstate', scheduleEnhance);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  else scheduleEnhance();
}());
