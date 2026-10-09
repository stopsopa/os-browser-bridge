// [
//   'ARMAGHNone Available',
//   'BALLYMENANone Available',
//   'BALMORALNone Available',
//   'COLERAINENone October 2026',
//   'COOKSTOWNNone Available',
//   'CRAIGAVONNone Available',
//   'DOWNPATRICKNone Available',
//   'ENNISKILLENNone Available',
//   'HYDEBANKNone January 2027',
//   'LARNENone Available',
//   'LISBURNNone Available',
//   'MALLUSKNone Available',
//   'NEWBUILDINGSNone Available',
//   'NEWRYNone Available',
//   'NEWTOWNARDSNone Available',
//   'OMAGHNone Available'
// ]

const subsetImInterestedWith = ["BALLYMENA", "COOKSTOWN"];

export default function availableMot(array: string[]): string[] | undefined {
  const filterOut = array
    .filter((e) => !e.endsWith("None Available"))
    .map((e) => e.replace(/None Available$/, ""));

  if (filterOut.length === 0) {
    return undefined;
  }

  const overlap = filterOut.filter((e) =>
    subsetImInterestedWith.some((location) => e.startsWith(location)),
  );

  if (overlap.length === 0) {
    return undefined;
  }

  return overlap;
}
