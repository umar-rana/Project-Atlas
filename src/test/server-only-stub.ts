// no-op stub — server-only is a Next.js guard that throws outside RSC;
// in vitest (Node/jsdom) we replace it with this empty module so tests can
// import server modules directly without build-time enforcement.
export {};
