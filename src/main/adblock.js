'use strict';
// חוסם פרסומות וטראקרים ברמת הרשת (לפני שהבקשה יוצאת) – חוסך רוחב פס, RAM ו-CPU.
const DOMAINS = [
  // Google ads
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com',
  'googletagmanager.com', 'googletagservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'imasdk.googleapis.com',
  // Ad networks
  'adnxs.com', 'adsrvr.org', 'advertising.com', 'amazon-adsystem.com', 'criteo.com', 'criteo.net',
  'taboola.com', 'outbrain.com', 'revcontent.com', 'mgid.com', 'pubmatic.com', 'rubiconproject.com',
  'openx.net', 'casalemedia.com', 'smartadserver.com', 'adform.net', 'bidswitch.net', 'sharethrough.com',
  'teads.tv', 'yieldmo.com', 'media.net', 'contextweb.com', '33across.com', 'indexww.com', 'lijit.com',
  'sovrn.com', 'gumgum.com', 'triplelift.com', 'adcolony.com', 'applovin.com', 'unityads.unity3d.com',
  'popads.net', 'popcash.net', 'propellerads.com', 'adsterra.com', 'exoclick.com', 'juicyads.com',
  'trafficjunky.net', 'zedo.com', 'adroll.com', 'adzerk.net', 'moatads.com', 'serving-sys.com',
  'spotxchange.com', 'springserve.com', 'undertone.com', 'adblade.com', 'buysellads.com', 'carbonads.net',
  'infolinks.com', 'vibrantmedia.com', 'yieldlove.com', 'adthrive.com', 'mediavine.com', 'ezoic.net',
  // Trackers / analytics
  'scorecardresearch.com', 'quantserve.com', 'quantcount.com', 'hotjar.com', 'hotjar.io', 'mouseflow.com',
  'crazyegg.com', 'fullstory.com', 'mixpanel.com', 'segment.io', 'segment.com', 'amplitude.com',
  'chartbeat.com', 'chartbeat.net', 'newrelic.com', 'nr-data.net', 'optimizely.com', 'clarity.ms',
  'bat.bing.com', 'ads.linkedin.com', 'analytics.tiktok.com', 'ads-api.tiktok.com', 'connect.facebook.net',
  'pixel.facebook.com', 'an.facebook.com', 'ads.twitter.com', 'static.ads-twitter.com', 'analytics.twitter.com',
  'ads.yahoo.com', 'analytics.yahoo.com', 'adtech.de', 'bluekai.com', 'krxd.net', 'demdex.net',
  'omtrdc.net', 'everesttech.net', 'rlcdn.com', 'tapad.com', 'agkn.com', 'mathtag.com', 'eyeota.net',
  'crwdcntrl.net', 'exelator.com', 'addthis.com', 'sharethis.com', 'branch.io', 'app-measurement.com',
  'adjust.com', 'appsflyer.com', 'kochava.com', 'onesignal.com', 'pushcrew.com', 'pushwoosh.com'
];

const SET = new Set(DOMAINS);

function isBlocked(host) {
  if (!host) return false;
  host = host.toLowerCase();
  // בדיקת סיומת: ads.example.doubleclick.net → doubleclick.net
  let h = host;
  while (true) {
    if (SET.has(h)) return true;
    const i = h.indexOf('.');
    if (i < 0) return false;
    h = h.slice(i + 1);
    if (!h.includes('.')) return false;
  }
}

module.exports = { isBlocked, DOMAINS };
