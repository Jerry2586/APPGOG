@php
  $allowedThemeColors = ['default', 'blue', 'black', 'darkblue'];
  $allowedDensities = ['comfortable', 'compact'];
  $themeColor = in_array($theme_config['theme_color'] ?? '', $allowedThemeColors, true)
    ? $theme_config['theme_color']
    : 'blue';
  $contentDensity = in_array($theme_config['content_density'] ?? '', $allowedDensities, true)
    ? $theme_config['content_density']
    : 'comfortable';
  $assetRoot = '/theme/' . rawurlencode($theme) . '/assets';
@endphp
<!doctype html>
<html lang="zh-CN" data-appgog-theme="xboard" data-appgog-accent="{{ $themeColor }}" data-appgog-density="{{ $contentDensity }}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="description" content="{{ $description }}" />
  <title>APPGOG Console</title>
  <link rel="stylesheet" href="{{ $assetRoot }}/appgog.css?v={{ rawurlencode($version) }}" />
  <script type="module" crossorigin src="{{ $assetRoot }}/umi.js"></script>
  <script defer src="{{ $assetRoot }}/appgog-shell.js?v={{ rawurlencode($version) }}"></script>
</head>
<body>
  <a class="appgog-skip-link" href="#appgog-main">跳到主要内容</a>
  <script>
    window.routerBase = "/";
    window.settings = {
      title: "APPGOG",
      assets_path: {{ Illuminate\Support\Js::from($assetRoot) }},
      theme: {
        color: {{ Illuminate\Support\Js::from($themeColor) }}
      },
      version: {{ Illuminate\Support\Js::from($version) }},
      background_url: {{ Illuminate\Support\Js::from($assetRoot . '/images/background.svg') }},
      description: {{ Illuminate\Support\Js::from($description) }},
      i18n: ["zh-CN", "en-US", "ja-JP", "vi-VN", "ko-KR", "zh-TW", "fa-IR"],
      logo: {{ Illuminate\Support\Js::from($logo) }}
    };
  </script>
  <div id="app"></div>
  <noscript>需要启用 JavaScript 才能使用 Xboard 用户控制台。</noscript>
</body>
</html>
