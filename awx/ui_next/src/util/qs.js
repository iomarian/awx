/**
 * Returns queryset config with defaults, if needed
 * @param {string} namespace for appending to url querystring
 * @param {object} default params that are not handled with search (page, page_size and order_by)
 * @param {array} params that are number fields
 * @return {object} query param object
 */
export function getQSConfig(
  namespace,
  defaultParams = { page: 1, page_size: 5, order_by: 'name' },
  integerFields = ['page', 'page_size'],
  dateFields = ['modified', 'created']
) {
  if (!namespace) {
    throw new Error('a QS namespace is required');
  }
  return {
    namespace,
    defaultParams,
    integerFields,
    dateFields,
  };
}

/**
 * Convert url query string to query param object
 * @param {object} qs config object (used for getting defaults, current query params etc.)
 * @param {string} url query string
 * @return {object} query param object
 */
export function parseQueryString(config, queryString) {
  if (!queryString) {
    return config.defaultParams;
  }
  const params = stringToObject(config, queryString);
  return addDefaultsToObject(config, params);
}

/**
 * Convert query param object to url query string
 * Used to encode params for interacting with the api
 * @param {object} qs config object for namespacing params, filtering defaults
 * @param {object} query param object
 * @return {string} url query string
 */
export const encodeQueryString = params => {
  if (!params) return '';

  return Object.keys(params)
    .sort()
    .filter(key => params[key] !== null)
    .map(key => [key, params[key]])
    .map(([key, value]) => encodeValue(key, value))
    .join('&');
};

function encodeValue(key, value) {
  if (Array.isArray(value)) {
    return value
      .map(val => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
      .join('&');
  }
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/**
 * Convert query param object to url query string, adding namespace and removing defaults
 * Used to put into url bar after ui route
 * @param {object} qs config object for namespacing params, filtering defaults
 * @param {object} query param object
 * @return {string} url query string
 */
export const encodeNonDefaultQueryString = (config, params) => {
  if (!params) return '';

  const namespacedParams = namespaceParams(config.namespace, params);
  const namespacedDefaults = namespaceParams(
    config.namespace,
    config.defaultParams
  );
  const namespacedDefaultKeys = Object.keys(namespacedDefaults);
  const namespacedParamsWithoutDefaultsKeys = Object.keys(
    namespacedParams
  ).filter(
    key =>
      namespacedDefaultKeys.indexOf(key) === -1 ||
      !paramValueIsEqual(namespacedParams[key], namespacedDefaults[key])
  );

  return namespacedParamsWithoutDefaultsKeys
    .sort()
    .filter(key => namespacedParams[key] !== null)
    .map(key => {
      return [key, namespacedParams[key]];
    })
    .map(([key, value]) => encodeValue(key, value))
    .join('&');
};

/**
 * Merges existing params of query string with new ones and returns the
 * updated list of params
 * @param {object} qs config object (used for getting defaults, current query params etc.)
 * @param {object} object with params from existing query
 * @param {object} object with new params to add
 * @return {object} query param object
 */
export function addParams(config, oldParams, paramsToAdd) {
  const namespacedOldParams = namespaceParams(config.namespace, oldParams);
  const namespacedParamsToAdd = namespaceParams(config.namespace, paramsToAdd);
  const namespacedDefaultParams = namespaceParams(
    config.namespace,
    config.defaultParams
  );

  const namespacedOldParamsNotDefaults = getNonDefaultParams(
    namespacedOldParams,
    namespacedDefaultParams
  );
  const namespacedMergedParams = getMergedParams(
    namespacedOldParamsNotDefaults,
    namespacedParamsToAdd
  );

  // return updated params.
  // If newParams includes updates to the defaults, they will be replaced,
  // not concatenated.
  return denamespaceParams(config.namespace, {
    ...getDefaultParams(namespacedOldParams, namespacedDefaultParams),
    ...namespacedMergedParams,
    ...getRemainingNewParams(namespacedMergedParams, namespacedParamsToAdd),
  });
}

/**
 * Removes params from the search string and returns the updated list of params
 * @param {object} qs config object (used for getting defaults, current query params etc.)
 * @param {object} object with params from existing search
 * @param {object} object with new params to remove
 * @return {object} query param object
 */
export function removeParams(config, oldParams, paramsToRemove) {
  const paramsEntries = [];
  Object.entries(oldParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(val => {
        paramsEntries.push([key, val]);
      });
    } else {
      paramsEntries.push([key, value]);
    }
  });
  const paramsToRemoveEntries = Object.entries(paramsToRemove);
  const remainingEntries = paramsEntries.filter(
    ([key, value]) =>
      paramsToRemoveEntries.filter(
        ([newKey, newValue]) => key === newKey && value === newValue
      ).length === 0
  );
  const remainingObject = arrayToObject(remainingEntries);
  const defaultEntriesLeftover = Object.entries(config.defaultParams).filter(
    ([key]) => !remainingObject[key]
  );
  const finalParamsEntries = remainingEntries;
  defaultEntriesLeftover.forEach(value => {
    finalParamsEntries.push(value);
  });
  return arrayToObject(finalParamsEntries);
}

const stringToObject = (config, qs) => {
  const params = {};
  qs.replace(/^\?/, '')
    .split('&')
    .map(s => s.split('='))
    .forEach(([nsKey, rawValue]) => {
      if (!nsKey || !namespaceMatches(config.namespace, nsKey)) {
        return;
      }
      const key = decodeURIComponent(nsKey.substr(config.namespace.length + 1));
      const value = parseValue(config, key, rawValue);
      if (!params[key]) {
        params[key] = value;
      } else if (Array.isArray(params[key])) {
        params[key].push(value);
      } else {
        params[key] = [params[key], value];
      }
    });
  return params;
};
export { stringToObject as _stringToObject };

function parseValue(config, key, rawValue) {
  if (config.integerFields && config.integerFields.some(v => v === key)) {
    return parseInt(rawValue, 10);
  }
  // TODO: parse date fields
  return decodeURIComponent(rawValue);
}

function addDefaultsToObject(config, params) {
  return {
    ...config.defaultParams,
    ...params,
  };
}
export { addDefaultsToObject as _addDefaultsToObject };

/**
 * helper function used to convert from
 * Object.entries format ([ [ key, value ], ... ]) to object
 * @param {array} array in the format [ [ key, value ], ...]
 * @return {object} object in the forms { key: value, ... }
 */
const arrayToObject = entriesArr =>
  entriesArr.reduce((acc, [key, value]) => {
    if (acc[key] && Array.isArray(acc[key])) {
      acc[key].push(value);
    } else if (acc[key]) {
      acc[key] = [acc[key], value];
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});

/**
 * helper function to namespace params object
 * @param {string} namespace to append to params
 * @param {object} params object to append namespace to
 * @return {object} params object with namespaced keys
 */
const namespaceParams = (namespace, params = {}) => {
  if (!namespace) return params;

  const namespaced = {};
  Object.keys(params).forEach(key => {
    namespaced[`${namespace}.${key}`] = params[key];
  });

  return namespaced || {};
};

/**
 * helper function to remove namespace from params object
 * @param {string} namespace to remove from params
 * @param {object} params object to append namespace to
 * @return {object} params object with non-namespaced keys
 */
const denamespaceParams = (namespace, params = {}) => {
  if (!namespace) return params;

  const denamespaced = {};
  Object.keys(params).forEach(key => {
    denamespaced[key.substr(namespace.length + 1)] = params[key];
  });

  return denamespaced;
};

/**
 * helper function to check the namespace of a param is what you expec
 * @param {string} namespace to append to params
 * @param {object} params object to append namespace to
 * @return {object} params object with namespaced keys
 */
const namespaceMatches = (namespace, fieldname) => {
  if (!namespace) return !fieldname.includes('.');

  return fieldname.startsWith(`${namespace}.`);
};

/**
 * helper function to check the value of a param is equal to another
 * @param {string or number or array} param value one
 * @param {string or number or array} params value two
 * @return {boolean} true if values are equal
 */
const paramValueIsEqual = (one, two) => {
  let isEqual = false;

  if (Array.isArray(one) && Array.isArray(two)) {
    isEqual = one.filter(val => two.indexOf(val) > -1).length === one.length;
  } else if (
    (typeof one === 'string' && typeof two === 'string') ||
    (typeof one === 'number' && typeof two === 'number')
  ) {
    isEqual = one === two;
  }

  return isEqual;
};

/**
 * helper function to get params that are defaults
 * @param {object} namespaced params object
 * @param {object} namespaced params object of default params
 * @return {object} namespaced params object of only defaults
 */
const getDefaultParams = (params, defaults) =>
  arrayToObject(
    Object.keys(params)
      .filter(key => Object.keys(defaults).indexOf(key) > -1)
      .map(key => [key, params[key]])
  );

/**
 * helper function to get params that are not defaults
 * @param {object} namespaced params object
 * @param {object} namespaced params object of default params
 * @return {object} namespaced params object of non-defaults
 */
const getNonDefaultParams = (params, defaults) =>
  arrayToObject(
    Object.keys(params)
      .filter(key => Object.keys(defaults).indexOf(key) === -1)
      .map(key => [key, params[key]])
  );

/**
 * helper function to merge old and new params together
 * @param {object} namespaced params object old params with defaults filtered out
 * @param {object} namespaced params object of new params
 * @return {object} merged namespaced params object
 */
const getMergedParams = (oldParams, newParams) =>
  arrayToObject(
    Object.keys(oldParams).map(key => {
      let oldVal = oldParams[key];
      const newVal = newParams[key];
      if (newVal) {
        if (Array.isArray(oldVal)) {
          oldVal.push(newVal);
        } else {
          oldVal = [oldVal, newVal];
        }
      }
      return [key, oldVal];
    })
  );

/**
 * helper function to get new params that are not in merged params
 * @param {object} namespaced params object of merged params
 * @param {object} namespaced params object of new params
 * @return {object} remaining new namespaced params object
 */
const getRemainingNewParams = (mergedParams, newParams) =>
  arrayToObject(
    Object.keys(newParams)
      .filter(key => Object.keys(mergedParams).indexOf(key) === -1)
      .map(key => [key, newParams[key]])
  );
