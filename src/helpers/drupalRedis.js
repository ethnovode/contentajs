// @flow

import type { CacheEntry } from '../../types/drupalRedis';

const _ = require('lodash');
const config = require('config');

// I am not convinced that Drupal's Redis integration supports clustering. So
// until that happens we don't need to bother ourselves with clustering in here.
const Redis = require('ioredis');

let drupalRedis: ?Redis;
const init = (prefix: string): Redis => {
  const redisOptions: { [string]: any } = config.util.toObject(
    config.get('redis.options')
  );
  redisOptions.keyPrefix = prefix;
  const redisHost: string = config.get('redis.host');
  drupalRedis = new Redis(redisHost, redisOptions);
  return drupalRedis;
};

/**
 * Generates the Redis cid based on the cache cid.
 *
 * @param {string} cid
 *   The cache ID to prefix.
 * @param {string} bin
 *   The cache bin this entry is stored in.
 * @param {string} template
 *   The cache ID template to replace.
 *
 * @return {string}
 *   The cache ID in Redis.
 */
const generateCid = (cid: string, bin: string, template: string): string =>
  template.replace('{bin}', bin).replace('{cid}', cid);

/**
 * Checks if the existing cache entry is still valid to use.
 *
 * @param {CacheEntry} cached
 *   The cache entry to check.
 * @param {string} template
 *   The cache ID template to replace.
 * @param {Redis} instance
 *   The Redis client.
 *
 * @return {Promise<boolean>}
 *   TRUE if it's valid. FALSE otherwise.
 */
const isValidCacheEntry = (
  cached: CacheEntry,
  template: string,
  instance: Redis
): Promise<boolean> => {
  // Inspect the cache object to make sure it's valid.
  if (
    cached.cid.length === 0 ||
    !cached.valid ||
    (parseInt(cached.expire, 10) !== -1 && cached.expire < Date.now() / 1000)
  ) {
    return Promise.resolve(false);
  }
  // Now validate the cache tags.
  const tags = cached.tags.split(' ');
  // Do not use 'mget' since that is not a cluster-friendly operation.
  const cacheIds = tags.map(tag => generateCid(tag, 'cachetags', template));
  return (
    instance
      .mget(cacheIds)
      // Remove all the empty responses.
      .then(tagsData => tagsData.filter(i => i))
      // Calculate the checksum by adding the results.
      .then(tagsData =>
        tagsData.reduce((carry, item) => carry + parseInt(item, 10), 0)
      )
      .then(
        computedChecksum => parseInt(cached.checksum, 10) === computedChecksum
      )
  );
};

module.exports = (
  prefix: string,
  template: string
): { redisGet: Function, redis: Redis } => {
  const instance = !drupalRedis ? init(prefix) : drupalRedis;
  return {
    redisGet(cid: string) {
      const newCid = generateCid(cid, 'page', template);
      return instance.hgetall(newCid).then((res: CacheEntry) => {
        if (!Object.keys(res).length) {
          return Promise.resolve();
        }
        return !isValidCacheEntry(res, template, instance).then(isValid => {
          if (!isValid) {
            return Promise.resolve();
          }
          // Cache entries coming from Drupal are PHP-serialized responses. This
          // regular expression will extract the response data from there.
          const content = _.get(res, 'data', '').replace(
            /(.*"\0\*\0content";s:\d+:")([^\0]+)([^\\])";.*/,
            '$2$3'
          );
          return JSON.parse(content);
        });
      });
    },
    redis: instance,
  };
};
