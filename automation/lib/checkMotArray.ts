// [
//   'ARMAGHNone Available',
//   'BALLYMENANone Available',
//   'BALMORALNone Available',
//   'COLERAINENone Available',
//   'COOKSTOWNNone Available',
//   'CRAIGAVONNone Available',
//   'DOWNPATRICKNone Available',
//   'ENNISKILLENNone Available',
//   'HYDEBANKNone Available',
//   'LARNENone Available',
//   'LISBURNNone Available',
//   'MALLUSKNone Available',
//   'NEWBUILDINGSNone Available',
//   'NEWRYNone Available',
//   'NEWTOWNARDSNone Available',
//   'OMAGHNone Available'
// ]

const subsetImInterestedWith = [
  "BALLYMENA",
  "COOKSTOWN",
];

export default function availableMot(array: string[]): string[] | undefined {
  const filterOut = array.filter((e) => !e.endsWith("None Available"));

  if (filterOut.length === 0) {
    return undefined;
  }

  const overlap = filterOut.filter((e) => subsetImInterestedWith.includes(e));

  if (overlap.length === 0) {
    return undefined;
  }

  return overlap;
}
