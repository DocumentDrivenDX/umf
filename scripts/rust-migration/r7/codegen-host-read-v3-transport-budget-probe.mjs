// Exercise cumulative host-response work accounting through the real V3 bridge.
export async function runCumulativeHostResponseBudgetProbe(createGenerator, source) {
  let total = 0;
  let threshold = Number.POSITIVE_INFINITY;
  let textReads = 0;
  let beforeThirdRead;
  let firstChargeAfterThirdRead;
  const generator = await createGenerator({
    controls: {
      meter(amount) {
        total += amount;
        if (textReads === 3 && firstChargeAfterThirdRead === undefined) {
          firstChargeAfterThirdRead = amount;
        }
        if (total > threshold) throw new Error('cumulative host-response work budget exceeded');
      },
    },
  });
  const request = () => ({
    get text() {
      textReads += 1;
      if (textReads === 3) beforeThirdRead = total;
      return source;
    },
    package: 'shop',
  });

  total = 0;
  textReads = 0;
  generator(request());
  if (textReads < 3 || beforeThirdRead === undefined || firstChargeAfterThirdRead === undefined) {
    throw new Error('V3 did not reach the second source-text host response');
  }
  const responseLimit = beforeThirdRead + firstChargeAfterThirdRead - 1;
  if (responseLimit <= beforeThirdRead || firstChargeAfterThirdRead <= 0) {
    throw new Error('The cumulative response threshold was not between the two response checkpoints');
  }

  total = 0;
  threshold = responseLimit;
  textReads = 0;
  beforeThirdRead = undefined;
  firstChargeAfterThirdRead = undefined;
  let error;
  try {
    generator(request());
  } catch (caught) {
    error = caught;
  }
  if (error?.code !== 'METER_FAILURE' || textReads !== 3 || total <= responseLimit) {
    throw new Error(`Cumulative response budget did not fail at the second response: ${JSON.stringify({code:error?.code,textReads,total,responseLimit})}`);
  }
  const getterReadsAtFailure = textReads;
  const workAtFailure = total;

  total = 0;
  threshold = Number.POSITIVE_INFINITY;
  textReads = 0;
  const recovered = generator(request());
  if (textReads !== 4 || recovered.files.length === 0) {
    throw new Error('V3 did not recover with fresh per-invocation accounting');
  }
  return {
    responsePayloadsIdentical: true,
    firstResponseWorkUpperBound: beforeThirdRead,
    secondResponseWork: firstChargeAfterThirdRead,
    responseLimit,
    workAtFailure,
    failedCode: error.code,
    getterReadsAtFailure,
    recovered: true,
  };
}
