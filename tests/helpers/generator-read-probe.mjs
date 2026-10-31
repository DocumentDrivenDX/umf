// Host-neutral observations for the current synchronous request boundary.
// Kept dependency-free so the exact same probe runs in Bun, Node and Chromium.
export function runGeneratorReadProbe(generate, commerce, nativeTable) {
  const describeError = (fn, sentinel) => {
    try { return { ok: true, value: fn() }; }
    catch (error) {
      return { ok: false, error: {
        name: error?.constructor?.name ?? typeof error,
        code: error?.code,
        path: error?.path,
        message: error?.message,
        ...(sentinel ? { sameObject: error === sentinel } : {}),
      } };
    }
  };
  const traces = {};

  const stable = [];
  const stableRequest = new Proxy({
    text: commerce,
    package: 'shop',
    get archive() { stable.push('archive'); throw new Error('generator must not read an archive'); },
  }, {
    get(target, key, receiver) {
      stable.push(String(key));
      return Reflect.get(target, key, receiver);
    },
  });
  const stableResult = generate(stableRequest);
  traces.stable = {
    gets: stable,
    paths: stableResult.files.map((file) => file.path),
  };

  const invalid = [];
  const invalidResult = describeError(() => generate(new Proxy({
    get text() { invalid.push('text'); return commerce; },
    get package() { invalid.push('package'); return 'bad-name'; },
    get format() { invalid.push('format'); throw new Error('format getter sentinel'); },
  }, { get(target, key, receiver) {
    if (key === 'text' || key === 'package' || key === 'format') return Reflect.get(target, key, receiver);
    return undefined;
  } })));
  traces.invalidPackage = { gets: invalid, result: invalidResult };

  const recordsAfterPackage = [];
  const recordsAfterPackageResult = describeError(() => generate({
    text: commerce,
    package: 'bad-name',
    get records() { recordsAfterPackage.push('records'); throw new Error('records getter sentinel'); },
  }));
  traces.invalidPackageBeforeRecords = {
    gets: recordsAfterPackage,
    result: { ok: recordsAfterPackageResult.ok, code: recordsAfterPackageResult.error?.code, path: recordsAfterPackageResult.error?.path },
  };

  const formatErrorTrace = [];
  const formatSentinel = new Error('format getter sentinel');
  const formatFailure = describeError(() => generate({
    text: commerce,
    package: 'shop',
    get format() { formatErrorTrace.push('format'); throw formatSentinel; },
  }), formatSentinel);
  traces.formatGetterFailure = {
    gets: formatErrorTrace,
    result: { ok: formatFailure.ok, name: formatFailure.error?.name, message: formatFailure.error?.message, sameObject: formatFailure.error?.sameObject },
  };

  const reads = [];
  const variants = [
    commerce,
    commerce.replace('Unified client commerce fixture', 'parsed-source'),
    commerce.replace('Unified client commerce fixture', 'digest-source'),
    commerce.replace('Unified client commerce fixture', 'returned-source'),
  ];
  const changingText = generate({
    get text() { return variants[reads.push('text') - 1]; },
    package: 'shop',
  });
  traces.changingText = {
    reads,
    sourceDigest: changingText.sourceDigest,
    returnedTitle: JSON.parse(changingText.files.find((file) => file.path === 'shop/source.json')?.text ?? '{}').title,
  };

  let packageReadCount = 0;
  const changingPackage = generate({
    text: commerce,
    get package() {
      packageReadCount++;
      return packageReadCount <= 4 ? 'shop' : `package_${packageReadCount}`;
    },
  });
  traces.changingPackage = { gets: packageReadCount, paths: changingPackage.files.map((file) => file.path) };

  const crossed = [];
  const sourceSentinel = new Error('text getter sentinel');
  const crossedResult = describeError(() => generate({
    get text() { crossed.push('text'); throw sourceSentinel; },
    get package() { crossed.push('package'); return 'bad-name'; },
  }), sourceSentinel);
  traces.invalidPackageAndThrowingText = {
    gets: crossed,
    result: { ok: crossedResult.ok, error: crossedResult.error },
  };

  const recordsReads = [];
  const recordMapTrace = [];
  const recordSelection = generate({
    text: commerce,
    package: 'shop',
    get records() {
      recordsReads.push('records');
      return {
        map(callback) {
          recordMapTrace.push('map');
          return new Set([callback({ module: 'commerce', element: 'Customer' })]);
        },
      };
    },
  });
  traces.recordsSelection = {
    gets: recordsReads,
    map: recordMapTrace,
    selectedCustomer: recordSelection.description.records['commerce.Customer']?.selected,
    selectedOrder: recordSelection.description.records['commerce.Order']?.selected,
  };

  let throwingRecordReads = 0;
  const secondRecordsSentinel = new Error('second records getter sentinel');
  const recordGetterResult = describeError(() => generate({
    text: commerce,
    package: 'shop',
    get records() {
      throwingRecordReads++;
      if (throwingRecordReads === 1) return [];
      throw secondRecordsSentinel;
    },
  }), secondRecordsSentinel);
  traces.throwingRecordsGetter = {
    gets: throwingRecordReads,
    result: { ok: recordGetterResult.ok, name: recordGetterResult.error?.name, message: recordGetterResult.error?.message, sameObject: recordGetterResult.error?.sameObject },
  };

  const coercionTrace = [];
  const coercionSentinel = new Error('record module coercion sentinel');
  const coercionResult = describeError(() => generate({
    text: commerce,
    package: 'shop',
    records: [{
      get module() {
        coercionTrace.push('module');
        return { [Symbol.toPrimitive]() { coercionTrace.push('toPrimitive'); throw coercionSentinel; } };
      },
      get element() { coercionTrace.push('element'); return 'Customer'; },
    }],
  }), coercionSentinel);
  traces.recordCoercionFailure = {
    gets: coercionTrace,
    result: { ok: coercionResult.ok, name: coercionResult.error?.name, message: coercionResult.error?.message, sameObject: coercionResult.error?.sameObject },
  };

  const iteratorTrace = [];
  const iteratorSentinel = new Error('records iterator sentinel');
  const iteratorResult = describeError(() => generate({
    text: commerce,
    package: 'shop',
    get records() {
      iteratorTrace.push('records');
      return { map() {
        iteratorTrace.push('map');
        return { [Symbol.iterator]() { iteratorTrace.push('iterator'); throw iteratorSentinel; } };
      } };
    },
  }), iteratorSentinel);
  traces.recordsIteratorFailure = {
    gets: iteratorTrace,
    result: { ok: iteratorResult.ok, name: iteratorResult.error?.name, message: iteratorResult.error?.message, sameObject: iteratorResult.error?.sameObject },
  };

  const badSourceReads = [];
  const badSourceResult = describeError(() => generate({
    text: '{',
    package: 'shop',
    get records() { badSourceReads.push('records'); throw new Error('records sentinel'); },
  }));
  traces.sourceParseBeforeRecords = {
    gets: badSourceReads,
    result: { ok: badSourceResult.ok, name: badSourceResult.error?.name, message: badSourceResult.error?.message },
  };

  const actionReads = [];
  const actionMapTrace = [];
  const actionSelection = generate({
    text: commerce,
    package: 'shop',
    get actions() {
      actionReads.push('actions');
      return {
        map(callback) {
          actionMapTrace.push('map');
          return new Set([callback({ module: 'commerce', action: 'shipOrder' })]);
        },
      };
    },
  });
  traces.actionsSelection = {
    gets: actionReads,
    map: actionMapTrace,
    containsSelectedAction: actionSelection.files.find((file) => file.path === 'shop/models.py')?.text.includes('def ship_order('),
  };

  let throwingActionReads = 0;
  const secondActionsSentinel = new Error('second actions getter sentinel');
  const actionGetterResult = describeError(() => generate({
    text: commerce,
    package: 'shop',
    get actions() {
      throwingActionReads++;
      if (throwingActionReads === 1) return [];
      throw secondActionsSentinel;
    },
  }), secondActionsSentinel);
  traces.throwingActionsGetter = {
    gets: throwingActionReads,
    result: { ok: actionGetterResult.ok, name: actionGetterResult.error?.name, message: actionGetterResult.error?.message, sameObject: actionGetterResult.error?.sameObject },
  };

  const actionFailureTrace = [];
  const actionMapSentinel = new Error('actions map sentinel');
  const actionMapResult = describeError(() => generate({
    text: commerce,
    package: 'shop',
    get actions() {
      actionFailureTrace.push('actions');
      return { get map() { actionFailureTrace.push('map'); throw actionMapSentinel; } };
    },
  }), actionMapSentinel);
  traces.actionsMapFailure = {
    gets: actionFailureTrace,
    result: { ok: actionMapResult.ok, name: actionMapResult.error?.name, message: actionMapResult.error?.message, sameObject: actionMapResult.error?.sameObject },
  };

  const formatTrace = [];
  const nativeStableGets = [];
  const nativeStableRequest = new Proxy({ text: nativeTable, package: 'shop' }, {
    get(target, key, receiver) {
      nativeStableGets.push(String(key));
      return Reflect.get(target, key, receiver);
    },
  });
  const nativeStableResult = generate(nativeStableRequest);
  traces.nativeStable = {
    gets: nativeStableGets,
    paths: nativeStableResult.files.map((file) => file.path),
  };

  let nativePackageReadCount = 0;
  const changingNativePackage = generate({
    text: nativeTable,
    get package() {
      nativePackageReadCount++;
      return nativePackageReadCount <= 4 ? 'shop' : `native_package_${nativePackageReadCount}`;
    },
  });
  traces.changingNativePackage = {
    gets: nativePackageReadCount,
    paths: changingNativePackage.files.map((file) => file.path),
  };

  const nativeFormatResult = describeError(() => generate({
    text: nativeTable,
    package: 'shop',
    get format() { formatTrace.push('format'); return formatTrace.length === 1 ? 'json' : 'yaml'; },
  }));
  traces.nativeConditionalFormat = {
    gets: formatTrace,
    result: { ok: nativeFormatResult.ok, code: nativeFormatResult.error?.code, path: nativeFormatResult.error?.path, message: nativeFormatResult.error?.message },
  };

  const packageTrace = [];
  const packageSentinel = new Error('package coercion sentinel');
  const packageCoercion = describeError(() => generate({
    text: commerce,
    get package() {
      packageTrace.push('package');
      return { [Symbol.toPrimitive]() { packageTrace.push('toPrimitive'); throw packageSentinel; } };
    },
  }), packageSentinel);
  traces.packageCoercion = {
    gets: packageTrace,
    result: { ok: packageCoercion.ok, name: packageCoercion.error?.name, message: packageCoercion.error?.message, sameObject: packageCoercion.error?.sameObject },
  };

  return traces;
}
