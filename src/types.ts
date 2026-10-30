export type CacheEntry = {
    status: number;
    headers: Headers;
    body: Uint8Array;
    storedAt: Date;
    initialAge: number;
    expiresAt: number;
};

export type CacheHit = {
    entry: CacheEntry;
    fresh: boolean;
};

export type RevalidationResult = {
    notModified: boolean;
    entry: CacheEntry;
};
