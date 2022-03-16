import { ExportTypes } from '../constants/export-types';

export const AutomatonConverter = (schematic, exportType) => {
  switch (exportType) {
    case ExportTypes.LATEX:
      return toLatex(schematic);

    case ExportTypes.GRAPHVIZ:
      return toGraphViz(schematic);

    case ExportTypes.REACTFLOW:
      return toReactFlow(schematic);

    default:
      break;
  }
};

const toLatex = (schematic) => {
  return schematic;
};

const toGraphViz = (schematic) => {
  return schematic;
};

const toReactFlow = (schematic) => {
  return schematic;
};
