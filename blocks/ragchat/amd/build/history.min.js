/** Bounded, untrusted local history. Authentication and source URLs are never stored. */
define([], function() {
    'use strict';
    const VERSION = 1;
    const MAX_BYTES = 200000;
    const MAX_TURNS = 20;
    const MAX_SOURCES = 100;
    const RETENTION = 7 * 86400000;
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
        !['__proto__', 'constructor', 'prototype'].some(key => own(value, key));
    const text = (value, limit) => typeof value === 'string' && value.length <= limit;
    const id = value => Number.isSafeInteger(value) && value > 0;
    const sitePath = scope => scope.sitepath || '/';
    const validScope = scope => object(scope) && id(scope.userid) && id(scope.courseid) &&
        text(scope.origin, 2048) && /^https?:\/\//.test(scope.origin) &&
        text(sitePath(scope), 2048) && /^\/[^?#]*\/$|^\/$/.test(sitePath(scope));
    const key = scope => validScope(scope) ? 'block_ragchat:history:v1:' +
        encodeURIComponent(scope.origin) + ':' + encodeURIComponent(sitePath(scope)) + ':' + scope.userid + ':' + scope.courseid : null;
    const source = value => {
        if (!object(value) || !text(value.doc_id, 128) || !value.doc_id ||
                !text(value.contenthash, 40) || !/^[a-f0-9]{40}$/.test(value.contenthash)) { return null; }
        return {doc_id: value.doc_id, contenthash: value.contenthash,
            page: Number.isSafeInteger(value.page) && value.page > 0 && value.page < 1000000 ? value.page : 0,
            fragment: text(value.fragment, 4000) ? value.fragment : ''};
    };
    const turn = (value, now) => {
        if (!object(value) || !text(value.question, 4000) || !value.question.trim() ||
                !text(value.answer, 32000) || !value.answer.trim() || !text(value.at, 40) ||
                !Array.isArray(value.sources) || value.sources.length > MAX_SOURCES) { return null; }
        const instant = Date.parse(value.at);
        if (!Number.isFinite(instant) || instant < now - RETENTION || instant > now + 300000) { return null; }
        const sources = value.sources.map(source);
        if (sources.some(item => !item)) { return null; }
        const asked = text(value.askedAt, 40) ? Date.parse(value.askedAt) : instant;
        if (!Number.isFinite(asked) || asked < now - RETENTION || asked > instant) { return null; }
        return {question: value.question, answer: value.answer, at: new Date(instant).toISOString(),
            askedAt: new Date(asked).toISOString(), sources};
    };
    const envelope = (scope, turns) => ({v: VERSION, origin: scope.origin, sitepath: sitePath(scope), userid: scope.userid,
        courseid: scope.courseid, turns});
    const load = (storage, scope, now = Date.now()) => {
        const storageKey = key(scope);
        if (!storageKey) { return []; }
        try {
            const raw = storage.getItem(storageKey);
            // Three bytes per UTF-16 code unit safely bounds UTF-8 size without encoding allocations.
            if (!raw || raw.length * 3 > MAX_BYTES) { return []; }
            const value = JSON.parse(raw);
            if (!object(value) || value.v !== VERSION || value.origin !== scope.origin || value.sitepath !== sitePath(scope) ||
                    value.userid !== scope.userid || value.courseid !== scope.courseid ||
                    !Array.isArray(value.turns) || value.turns.length > MAX_TURNS) { return []; }
            const turns = value.turns.map(item => turn(item, now)).filter(Boolean);
            if (turns.reduce((sum, item) => sum + item.sources.length, 0) > MAX_SOURCES) { return []; }
            if (turns.length !== value.turns.length) {
                try {
                    if (turns.length) { storage.setItem(storageKey, JSON.stringify(envelope(scope, turns))); }
                    if (!turns.length) { storage.removeItem(storageKey); }
                } catch (storageError) { /* Retention still applies when writes are denied. */ }
            }
            return turns;
        } catch (error) { return []; }
    };
    const save = (storage, scope, records, now = Date.now()) => {
        const storageKey = key(scope);
        if (!storageKey || !Array.isArray(records)) { return []; }
        const turns = records.map(item => turn(item, now)).filter(Boolean)
            .sort((left, right) => left.askedAt.localeCompare(right.askedAt)).slice(-MAX_TURNS);
        let raw = JSON.stringify(envelope(scope, turns));
        while (turns.length && (raw.length * 3 > MAX_BYTES ||
                turns.reduce((sum, item) => sum + item.sources.length, 0) > MAX_SOURCES)) {
            turns.shift();
            raw = JSON.stringify(envelope(scope, turns));
        }
        try { storage.setItem(storageKey, raw); } catch (error) { /* Storage denial never blocks chat. */ }
        return turns;
    };
    const clear = (storage, scope) => {
        try { const storageKey = key(scope); if (storageKey) { storage.removeItem(storageKey); } }
        catch (error) { /* The in-memory conversation can still be cleared. */ }
    };
    const rehydrate = (record, allowed, origin) => {
        if (!Array.isArray(allowed)) { return null; }
        const sources = [];
        for (const stored of record.sources) {
            const current = allowed.find(item => object(item) && item.doc_id === stored.doc_id &&
                item.contenthash === stored.contenthash && text(item.doc, 1000));
            if (!current || !text(current.url, 2048) || !current.url) { return null; }
            let url;
            try {
                url = new URL(current.url, origin);
                if (url.origin !== origin || url.username || url.password ||
                        !['http:', 'https:'].includes(url.protocol)) { return null; }
            } catch (error) { return null; }
            sources.push({doc_id: stored.doc_id, contenthash: stored.contenthash, doc: current.doc,
                page: stored.page, fragment: stored.fragment, url: url.href});
        }
        return {question: record.question, answer: record.answer, at: record.at, askedAt: record.askedAt, sources};
    };
    return {key, load, save, clear, rehydrate};
});
