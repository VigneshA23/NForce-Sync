/* @ds-bundle: {"format":4,"namespace":"NforceOneDesignSystem_cc54f8","components":[{"name":"CTA","sourcePath":"components/core/CTA.jsx"},{"name":"Eyebrow","sourcePath":"components/core/Eyebrow.jsx"},{"name":"Footer","sourcePath":"components/core/Footer.jsx"},{"name":"Highlight","sourcePath":"components/core/Highlight.jsx"},{"name":"IconFeature","sourcePath":"components/core/IconFeature.jsx"},{"name":"Logo","sourcePath":"components/core/Logo.jsx"},{"name":"PostFrame","sourcePath":"components/core/PostFrame.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"}],"sourceHashes":{"components/core/CTA.jsx":"78b306140d8f","components/core/Eyebrow.jsx":"d291cafbbf92","components/core/Footer.jsx":"d6b033be08f2","components/core/Highlight.jsx":"f0681979e4cb","components/core/IconFeature.jsx":"243ebbfac218","components/core/Logo.jsx":"5566bb9788c5","components/core/PostFrame.jsx":"286214b65f77","components/core/Tag.jsx":"d1db7bf52f7c","ui_kits/social-posts/Announcement.jsx":"de5530c93978","ui_kits/social-posts/ArticleCard.jsx":"f10b6618e042","ui_kits/social-posts/Infographic.jsx":"40a6d05c6943","ui_kits/social-posts/Meme.jsx":"2177f23a889c","ui_kits/social-posts/Statement.jsx":"08c216e8c7e6"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.NforceOneDesignSystem_cc54f8 = window.NforceOneDesignSystem_cc54f8 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/CTA.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Call-to-action: a solid red pill, or the bordered URL sign-off used at the foot of posts. */
function CTA({
  children,
  variant = 'solid',
  size = 'md',
  href,
  style,
  ...rest
}) {
  const pad = size === 'lg' ? '16px 30px' : size === 'sm' ? '8px 16px' : '12px 22px';
  const fs = size === 'lg' ? 20 : size === 'sm' ? 14 : 16;
  const variants = {
    solid: {
      background: 'var(--nf-red)',
      color: 'var(--nf-white)',
      border: 'none',
      borderRadius: 'var(--radius-pill)',
      boxShadow: 'var(--shadow-red)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--nf-white)',
      border: '1px solid var(--nf-white)',
      borderRadius: 'var(--radius-pill)'
    },
    url: {
      background: 'transparent',
      color: 'var(--nf-white)',
      border: '1px solid var(--nf-red)',
      borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-body)',
      fontWeight: 600
    }
  };
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: pad,
    fontSize: fs,
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'none',
    letterSpacing: '0.01em',
    ...variants[variant],
    ...style
  };
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    href: href,
    style: base
  }, rest), children);
}
Object.assign(__ds_scope, { CTA });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/CTA.jsx", error: String((e && e.message) || e) }); }

// components/core/Eyebrow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Wide-tracked uppercase label / category banner (e.g. "MEMEWHILE"). */
function Eyebrow({
  children,
  color = 'var(--nf-red)',
  banner = false,
  style,
  ...rest
}) {
  const base = {
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 'var(--fs-eyebrow)',
    letterSpacing: 'var(--ls-eyebrow)',
    textTransform: 'uppercase',
    color,
    display: 'inline-block',
    lineHeight: 1.2
  };
  const bannerStyle = banner ? {
    color: 'var(--nf-white)',
    display: 'flex',
    alignItems: 'center',
    gap: 12
  } : null;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...base,
      ...bannerStyle,
      ...style
    }
  }, rest), banner && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 3,
      height: 20,
      background: 'var(--nf-red)',
      display: 'inline-block'
    }
  }), children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/core/Highlight.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Inline accent word — the signature NF1 red-word emphasis, with optional strikethrough-edit motif. */
function Highlight({
  children,
  tone = 'red',
  strike = false,
  style,
  ...rest
}) {
  const colors = {
    red: 'var(--nf-red)',
    salmon: 'var(--nf-salmon)',
    yellow: 'var(--nf-meme-yellow)',
    white: 'var(--nf-white)'
  };
  const base = {
    color: colors[tone] || colors.red,
    fontWeight: 'inherit'
  };
  if (strike) {
    return /*#__PURE__*/React.createElement("span", _extends({
      style: {
        position: 'relative',
        color: 'var(--nf-gray-500)',
        ...style
      }
    }, rest), /*#__PURE__*/React.createElement("span", {
      style: {
        textDecoration: 'line-through',
        textDecorationColor: 'var(--nf-red)',
        textDecorationThickness: 3
      }
    }, children));
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...base,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Highlight });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Highlight.jsx", error: String((e && e.message) || e) }); }

// components/core/IconFeature.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Icon + label unit for connector-style infographics (see OpenHands / MCP posts).
 * Icons come from the Lucide set via CDN (lucide-static SVG), tinted to the current color.
 */
function IconFeature({
  icon = 'cpu',
  label,
  sublabel,
  tone = 'white',
  size = 44,
  layout = 'vertical',
  style,
  ...rest
}) {
  const tint = tone === 'red' ? 'var(--nf-red)' : 'var(--nf-white)';
  // lucide-static svgs are black strokes on transparent → invert to white, or drop-shadow to red
  const filter = tone === 'red' ? 'invert(24%) sepia(88%) saturate(3200%) hue-rotate(348deg) brightness(92%)' : 'invert(100%)';
  const iconEl = /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: `https://unpkg.com/lucide-static@0.469.0/icons/${icon}.svg`,
    alt: "",
    width: size * 0.62,
    height: size * 0.62,
    style: {
      filter
    }
  }));
  const vertical = layout === 'vertical';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems: 'center',
      gap: vertical ? 8 : 14,
      textAlign: vertical ? 'center' : 'left',
      ...style
    }
  }, rest), iconEl, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 18,
      color: tint,
      lineHeight: 1.2
    }
  }, label), sublabel && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 400,
      fontSize: 13,
      color: 'var(--nf-gray-400)',
      marginTop: 2
    }
  }, sublabel)));
}
Object.assign(__ds_scope, { IconFeature });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconFeature.jsx", error: String((e && e.message) || e) }); }

// components/core/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** NF1 brand logo. Renders the transparent logo image; falls back to wordmark text if the asset is missing. */
function Logo({
  src = 'assets/logo.png',
  height = 48,
  variant = 'mark',
  style,
  ...rest
}) {
  if (variant === 'wordmark') {
    return /*#__PURE__*/React.createElement("span", _extends({
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 900,
        fontStyle: 'italic',
        fontSize: height,
        lineHeight: 1,
        letterSpacing: '-0.03em',
        color: 'var(--nf-white)',
        ...style
      }
    }, rest), "NF", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--nf-red)'
      }
    }, "1"));
  }
  return /*#__PURE__*/React.createElement("img", _extends({
    src: src,
    alt: "Nforce One",
    style: {
      height,
      width: 'auto',
      display: 'block',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Logo.jsx", error: String((e && e.message) || e) }); }

// components/core/Footer.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Bottom sign-off row: website URL, optionally with the logo. Sits inside a PostFrame. */
function Footer({
  url = 'www.nforceone.com',
  boxed = false,
  showLogo = false,
  logoSrc,
  tone = 'light',
  align = 'center',
  style,
  ...rest
}) {
  const color = tone === 'dark' ? 'var(--nf-ink-950)' : 'var(--nf-white)';
  const urlEl = boxed ? /*#__PURE__*/React.createElement("span", {
    style: {
      border: '1px solid var(--nf-red)',
      borderRadius: 'var(--radius-sm)',
      padding: '10px 18px',
      color,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 15
    }
  }, url) : /*#__PURE__*/React.createElement("span", {
    style: {
      color,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 15,
      letterSpacing: '0.01em'
    }
  }, url);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: align === 'center' ? 'center' : 'space-between',
      gap: 16,
      ...style
    }
  }, rest), showLogo && /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    src: logoSrc,
    height: 30
  }), urlEl);
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Footer.jsx", error: String((e && e.message) || e) }); }

// components/core/PostFrame.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const FORMATS = {
  landscape: {
    width: 800,
    height: 450
  },
  square: {
    width: 800,
    height: 800
  },
  portrait: {
    width: 800,
    height: 1000
  }
};
const THEMES = {
  dark: {
    background: 'var(--grad-dark-glow)',
    color: 'var(--nf-white)',
    footTone: 'light'
  },
  ink: {
    background: 'var(--nf-ink-950)',
    color: 'var(--nf-white)',
    footTone: 'light'
  },
  red: {
    background: 'var(--grad-red-field)',
    color: 'var(--nf-cream)',
    footTone: 'light'
  },
  light: {
    background: 'var(--nf-white)',
    color: 'var(--nf-ink-950)',
    footTone: 'dark'
  }
};

/** The base post artboard: fixed social format, brand theme, safe padding, optional logo + footer. */
function PostFrame({
  format = 'square',
  theme = 'dark',
  logo = true,
  logoSrc,
  logoCorner = 'top-left',
  footer = true,
  footerUrl = 'www.nforceone.com',
  footerBoxed = false,
  pad,
  children,
  style,
  ...rest
}) {
  const fmt = FORMATS[format] || FORMATS.square;
  const th = THEMES[theme] || THEMES.dark;
  const padding = pad != null ? pad : format === 'landscape' ? 40 : 56;
  const logoRight = logoCorner === 'top-right';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      width: fmt.width,
      height: fmt.height,
      background: th.background,
      color: th.color,
      fontFamily: 'var(--font-body)',
      padding,
      boxSizing: 'border-box',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, rest), logo && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: padding,
      [logoRight ? 'right' : 'left']: padding,
      zIndex: 3
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    src: logoSrc,
    height: format === 'landscape' ? 40 : 52
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 2,
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 2,
      marginTop: 'auto'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Footer, {
    url: footerUrl,
    boxed: footerBoxed,
    tone: th.footTone,
    align: footerBoxed ? 'between' : 'center'
  })));
}
Object.assign(__ds_scope, { PostFrame });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/PostFrame.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Small chip / badge — solid red, outline, or dark. */
function Tag({
  children,
  variant = 'solid',
  style,
  ...rest
}) {
  const variants = {
    solid: {
      background: 'var(--nf-red)',
      color: 'var(--nf-white)',
      border: 'none'
    },
    outline: {
      background: 'transparent',
      color: 'var(--nf-red)',
      border: '1px solid var(--nf-red)'
    },
    dark: {
      background: 'var(--nf-ink-800)',
      color: 'var(--nf-gray-200)',
      border: '1px solid var(--nf-ink-700)'
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '5px 12px',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 13,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      ...variants[variant],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// ui_kits/social-posts/Announcement.jsx
try { (() => {
// Square 800×800 emotional/community post on a red field with script accent (cf. "Happy Father's Day").
const {
  PostFrame
} = window.NforceOneDesignSystem_cc54f8;
function Announcement() {
  return /*#__PURE__*/React.createElement(PostFrame, {
    format: "square",
    theme: "red",
    logoSrc: "../../assets/logo.png",
    footerUrl: "www.nforceone.com"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-script)',
      fontSize: 96,
      color: 'var(--nf-salmon)',
      lineHeight: 0.9,
      marginBottom: 6
    }
  }, "Happy"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: 82,
      color: 'var(--nf-cream)',
      textTransform: 'uppercase',
      letterSpacing: '-0.01em',
      lineHeight: 1
    }
  }, "Father's Day"), /*#__PURE__*/React.createElement("p", {
    style: {
      maxWidth: 520,
      margin: '26px auto 0',
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 22,
      lineHeight: 1.4,
      color: 'rgba(245,239,234,.85)'
    }
  }, "to all the dads who became our first mentors, toughest critics, and biggest supporters.")));
}
window.Announcement = Announcement;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/social-posts/Announcement.jsx", error: String((e && e.message) || e) }); }

// ui_kits/social-posts/ArticleCard.jsx
try { (() => {
// Landscape 800×450 LinkedIn link card — dark tech article header (cf. "Red Teaming in AI").
const {
  PostFrame,
  Highlight,
  Eyebrow,
  CTA
} = window.NforceOneDesignSystem_cc54f8;
function ArticleCard() {
  return /*#__PURE__*/React.createElement(PostFrame, {
    format: "landscape",
    theme: "dark",
    logoSrc: "../../assets/logo.png",
    footer: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)',
      backgroundSize: '34px 34px',
      zIndex: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: -60,
      top: -40,
      width: 360,
      height: 360,
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(224,31,38,.30) 0%, transparent 65%)',
      zIndex: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 2,
      maxWidth: 520
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: 52,
      lineHeight: 1.02,
      textTransform: 'uppercase',
      letterSpacing: '-0.01em'
    }
  }, "Red Teaming ", /*#__PURE__*/React.createElement(Highlight, null, "in AI"), /*#__PURE__*/React.createElement("br", null), "and Impact Testing"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '18px 0 0',
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: 18,
      color: 'var(--nf-gray-300)'
    }
  }, "\u201CBreaking the system\u201D vs \u201CUnderstanding the consequences\u201D")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: 40,
      bottom: 36,
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement(CTA, {
    variant: "url",
    href: "#"
  }, "www.nforceone.com")));
}
window.ArticleCard = ArticleCard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/social-posts/ArticleCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/social-posts/Infographic.jsx
try { (() => {
// Square 800×800 connector infographic (cf. "OpenHands" / "Playwright MCP Server").
const {
  PostFrame,
  IconFeature
} = window.NforceOneDesignSystem_cc54f8;
function Infographic() {
  const left = [{
    icon: 'brain',
    label: 'Cognitive Reasoning'
  }, {
    icon: 'workflow',
    label: 'Complex Workflows'
  }, {
    icon: 'app-window',
    label: 'Browser Use'
  }];
  const right = [{
    icon: 'github',
    label: 'GitHub'
  }, {
    icon: 'terminal',
    label: 'CLI'
  }, {
    icon: 'container',
    label: 'Docker'
  }];
  const Col = ({
    items,
    side
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 34
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flexDirection: side === 'right' ? 'row-reverse' : 'row'
    }
  }, /*#__PURE__*/React.createElement(IconFeature, {
    icon: it.icon,
    label: it.label,
    layout: "horizontal",
    size: 40
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 1,
      background: 'var(--nf-ink-700)'
    }
  }))));
  return /*#__PURE__*/React.createElement(PostFrame, {
    format: "square",
    theme: "dark",
    logoSrc: "../../assets/logo.png",
    footerUrl: "www.nforceone.com"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: '50%',
      top: '44%',
      width: 420,
      height: 420,
      transform: 'translate(-50%,-50%)',
      background: 'radial-gradient(circle, rgba(224,31,38,.18) 0%, transparent 60%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(Col, {
    items: left,
    side: "left"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      flex: '0 0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 52,
      lineHeight: 1
    }
  }, "\uD83D\uDE4C"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 900,
      fontSize: 58,
      color: '#fff',
      letterSpacing: '-0.02em',
      marginTop: 6
    }
  }, "OpenHands"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 22,
      color: 'var(--nf-gray-300)',
      marginTop: 8,
      maxWidth: 340
    }
  }, "The Next-Gen ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--nf-red)'
    }
  }, "AI"), " Software Developer"), /*#__PURE__*/React.createElement("code", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      color: 'var(--nf-gray-500)',
      marginTop: 16
    }
  }, "browser.use()")), /*#__PURE__*/React.createElement(Col, {
    items: right,
    side: "right"
  })));
}
window.Infographic = Infographic;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/social-posts/Infographic.jsx", error: String((e && e.message) || e) }); }

// ui_kits/social-posts/Meme.jsx
try { (() => {
// Portrait 800×1000 meme post with the "MEMEWHILE" banner (cf. Titanic meme).
const {
  PostFrame,
  Eyebrow
} = window.NforceOneDesignSystem_cc54f8;
function Meme() {
  const Caption = ({
    children,
    style
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-impact)',
      color: 'var(--nf-meme-yellow)',
      textTransform: 'none',
      WebkitTextStroke: '2px #000',
      lineHeight: 1,
      position: 'absolute',
      ...style
    }
  }, children);
  const Panel = ({
    label,
    sub,
    children
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      background: 'var(--nf-ink-800)',
      border: '1px solid var(--nf-ink-700)',
      borderRadius: 'var(--radius-sm)',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--nf-gray-500)',
      fontFamily: 'var(--font-mono)',
      fontSize: 13
    }
  }, sub, children);
  return /*#__PURE__*/React.createElement(PostFrame, {
    format: "portrait",
    theme: "ink",
    logoSrc: "../../assets/logo.png",
    footer: false,
    pad: 40,
    style: {
      background: '#2a0d0d'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 40,
      left: 40,
      right: 40,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      zIndex: 3
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 34,
      background: 'var(--nf-ink-700)'
    }
  }), /*#__PURE__*/React.createElement(Eyebrow, {
    banner: true,
    style: {
      fontSize: 22,
      letterSpacing: '0.22em'
    }
  }, "Memewhile")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginTop: 40
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    sub: "[ band playing on deck ]"
  }, /*#__PURE__*/React.createElement(Caption, {
    style: {
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: 30
    }
  }, "Daily Standup"), /*#__PURE__*/React.createElement(Caption, {
    style: {
      bottom: 20,
      left: 12,
      fontSize: 26
    }
  }, "Sprint", /*#__PURE__*/React.createElement("br", null), "Review"), /*#__PURE__*/React.createElement(Caption, {
    style: {
      bottom: 20,
      right: 12,
      fontSize: 26,
      textAlign: 'right'
    }
  }, "Weekly Sync")), /*#__PURE__*/React.createElement(Panel, {
    sub: "[ ship sinking ]"
  }, /*#__PURE__*/React.createElement(Caption, {
    style: {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%,-50%)',
      fontSize: 46
    }
  }, "Production"))));
}
window.Meme = Meme;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/social-posts/Meme.jsx", error: String((e && e.message) || e) }); }

// ui_kits/social-posts/Statement.jsx
try { (() => {
// Landscape 800×450 clean statement on white with the strikethrough-edit motif (cf. "Browser Use").
const {
  PostFrame,
  Highlight
} = window.NforceOneDesignSystem_cc54f8;
function Statement() {
  return /*#__PURE__*/React.createElement(PostFrame, {
    format: "landscape",
    theme: "light",
    logoSrc: "../../assets/logo.png",
    footer: false
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: -40,
      bottom: -60,
      width: 320,
      height: 320,
      borderRadius: '50%',
      background: 'var(--nf-gray-100)',
      zIndex: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 2
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 32,
      lineHeight: 1.28,
      color: 'var(--nf-ink-950)',
      maxWidth: 640
    }
  }, "The ", /*#__PURE__*/React.createElement(Highlight, {
    strike: true
  }, "future"), " present of test automation isn't writing more scripts. It's describing the ", /*#__PURE__*/React.createElement(Highlight, null, "outcome"), "."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 34,
      fontFamily: 'var(--font-mono)',
      fontWeight: 500,
      fontSize: 44,
      color: 'var(--nf-ink-950)',
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 44,
      height: 44,
      borderRadius: '50%',
      border: '4px solid var(--nf-ink-950)'
    }
  }), "Browser Use"), /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '16px 0 0',
      fontFamily: 'var(--font-mono)',
      fontSize: 15,
      color: 'var(--nf-gray-500)'
    }
  }, "Click \u2192 Type \u2192 Wait \u2192 Assert", /*#__PURE__*/React.createElement("br", null), "\"Find the order and download the invoice.\"")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 40,
      bottom: 30,
      zIndex: 2,
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 15,
      color: 'var(--nf-red)'
    }
  }, "www.nforceone.com"));
}
window.Statement = Statement;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/social-posts/Statement.jsx", error: String((e && e.message) || e) }); }

__ds_ns.CTA = __ds_scope.CTA;

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.Highlight = __ds_scope.Highlight;

__ds_ns.IconFeature = __ds_scope.IconFeature;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.PostFrame = __ds_scope.PostFrame;

__ds_ns.Tag = __ds_scope.Tag;

})();
