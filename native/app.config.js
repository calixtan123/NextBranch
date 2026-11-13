// Expo loads this on top of app.json. Store builds (NEXTBRANCH_RELEASE_BUILD=1,
// set by the eas.json production profile) must carry a real public API origin.
// Development and ordinary CI export are not release builds and skip the gate.
const RESERVED_SUFFIXES = ['.invalid', '.test', '.example', '.localhost', '.local', '.internal', '.lan', '.home.arpa'];
const RESERVED_DOMAINS = ['example.com', 'example.net', 'example.org'];
// IPv4 literals that are never a public API host: [first address, last address, label].
const NON_PUBLIC_IPV4_RANGES = [
  ['0.0.0.0', '0.255.255.255', 'this network'],
  ['10.0.0.0', '10.255.255.255', 'private'],
  ['100.64.0.0', '100.127.255.255', 'shared address space'],
  ['127.0.0.0', '127.255.255.255', 'loopback'],
  ['169.254.0.0', '169.254.255.255', 'link-local'],
  ['172.16.0.0', '172.31.255.255', 'private'],
  ['192.0.0.0', '192.0.0.255', 'IETF protocol assignments'],
  ['192.0.2.0', '192.0.2.255', 'documentation'],
  ['192.168.0.0', '192.168.255.255', 'private'],
  ['198.18.0.0', '198.19.255.255', 'benchmarking'],
  ['198.51.100.0', '198.51.100.255', 'documentation'],
  ['203.0.113.0', '203.0.113.255', 'documentation'],
  ['224.0.0.0', '255.255.255.255', 'multicast and reserved'],
];

function ipv4ToNumber(address) {
  return address.split('.').reduce((total, octet) => total * 256 + Number(octet), 0);
}

function isNonPublicIpv4(host) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  const value = ipv4ToNumber(host);
  return NON_PUBLIC_IPV4_RANGES.some(([first, last]) => value >= ipv4ToNumber(first) && value <= ipv4ToNumber(last));
}

function releaseError(reason) {
  return new Error(`EXPO_PUBLIC_NEXTBRANCH_API_URL is not valid for a release build: ${reason}`);
}

function assertReleaseOrigin(value) {
  if (!value) throw releaseError('it is missing');
  // Metro embeds the raw value, which React Native parses without Node's normalization.
  const origin = /^https:\/\/([^\s\x00-\x1f\x7f:/?#@\\]+)(?::[0-9]+)?\/?$/.exec(value);
  if (!origin) {
    throw releaseError('use lowercase https:// followed by a host, an optional port and an optional trailing slash');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw releaseError('it is not an absolute URL');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Match the production hostname guard in native/src/api.ts against the raw host.
  if (/^(localhost|127\.)/i.test(origin[1]) ||
      host === 'localhost' || host.startsWith('[') || isNonPublicIpv4(host)) {
    throw releaseError('local, private and non-public address hosts are not allowed');
  }
  if (RESERVED_SUFFIXES.some(suffix => host.endsWith(suffix)) ||
      RESERVED_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) {
    throw releaseError('placeholder or reserved hosts are not allowed');
  }
}

module.exports = ({ config }) => {
  if (process.env.NEXTBRANCH_RELEASE_BUILD === '1') {
    assertReleaseOrigin(process.env.EXPO_PUBLIC_NEXTBRANCH_API_URL);
    for (const name of ['EXPO_PUBLIC_NEXTBRANCH_FIXTURE', 'EXPO_PUBLIC_NEXTBRANCH_SEED']) {
      if (process.env[name]) throw new Error(`${name} must not be set for a release build`);
    }
  }
  return { ...config, icon: './assets/icon.png' };
};
