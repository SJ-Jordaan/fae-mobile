import { Position } from 'react-flow-renderer';

export interface GetBezierPathParams {
  sourceX: number;
  sourceY: number;
  sourcePosition?: Position;
  targetX: number;
  targetY: number;
  targetPosition?: Position;
  curvature?: number;
}

interface GetControlWithCurvatureParams {
  pos: Position;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  c: number;
}

type MirrorProps = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  oX: number;
  oY: number;
};
function mirrorImage({ x1, y1, x2, y2, oX, oY }: MirrorProps): number[] {
  const a = y2 - y1;
  const b = -(x2 - x1);
  const c = -a * x1 - b * y1;

  const temp = (-2 * (a * oX + b * oY + c)) / (a * a + b * b);
  const x = temp * a + oX;
  const y = temp * b + oY;

  return [x, y];
}

function calculateControlOffset(distance: number, curvature: number): number {
  if (distance >= 0) {
    return 0.5 * distance;
  } else {
    return curvature * 25 * Math.sqrt(-distance);
  }
}

function getControlWithCurvature({
  pos,
  x1,
  y1,
  x2,
  y2,
  c,
}: GetControlWithCurvatureParams): [number, number] {
  let ctX: number, ctY: number;
  switch (pos) {
    case Position.Left:
      ctX = x1 - calculateControlOffset(x1 - x2, c);
      ctY = y1 + 30;
      break;
    case Position.Right:
      ctX = x1 + calculateControlOffset(x2 - x1, c);
      ctY = y1 - 30;
      break;
    case Position.Top:
      ctX = x1 + 30;
      ctY = y1 - calculateControlOffset(y1 - y2, c);
      break;
    case Position.Bottom:
      ctX = x1 - 30;
      ctY = y1 + calculateControlOffset(y2 - y1, c);
      break;
  }
  return [ctX, ctY];
}

export function getBezierPath({
  sourceX,
  sourceY,
  sourcePosition = Position.Bottom,
  targetX,
  targetY,
  targetPosition = Position.Top,
  curvature = 0.5,
}: GetBezierPathParams): string {
  const [sourceControlX, sourceControlY] = getControlWithCurvature({
    pos: sourcePosition,
    x1: sourceX,
    y1: sourceY,
    x2: targetX,
    y2: targetY,
    c: curvature,
  });

  const [flippedX, flippedY] = mirrorImage({
    x1: sourceX,
    y1: sourceY,
    x2: targetX,
    y2: targetY,
    oX: sourceControlX,
    oY: sourceControlY,
  });

  const [targetControlX, targetControlY] = getControlWithCurvature({
    pos: targetPosition,
    x1: targetX,
    y1: targetY,
    x2: sourceX,
    y2: sourceY,
    c: curvature,
  });

  return `M${sourceX},${sourceY} C${flippedX},${flippedY} ${targetControlX},${targetControlY} ${targetX},${targetY}`;
}
