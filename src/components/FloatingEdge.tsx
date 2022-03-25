import { TextField } from '@mui/material';
import React, { FC, useMemo, CSSProperties } from 'react';
import {
  EdgeProps,
  useStore,
  ReactFlowState,
  getEdgeCenter,
} from 'react-flow-renderer';

import { calcSelfLoop, getBezierPath, getEdgeParams } from '../helpers';

const nodeSelector = (s: ReactFlowState) => s.nodeInternals;

type EditableFloatingEdgeProps = {
  onLabelChange: (id: string, label: string) => void;
} & EdgeProps;

const FloatingEdge: FC<EditableFloatingEdgeProps> = ({
  id,
  source,
  target,
  style,
  markerEnd,
  label,
  data,
}) => {
  const nodeInternals = useStore(nodeSelector);

  const [selected, setSelected] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleClick = (event: React.MouseEvent<SVGTextElement>) => {
    event.stopPropagation();
    setSelected(true);
  };

  const handleBlur = () => {
    setSelected(false);

    if (
      !inputRef?.current ||
      !data?.onLabelChange ||
      typeof data.onLabelChange !== 'function'
    )
      return;

    data.onLabelChange(id, inputRef.current.value);
  };

  const sourceNode = useMemo(
    () => nodeInternals.get(source),
    [source, nodeInternals],
  );
  const targetNode = useMemo(
    () => nodeInternals.get(target),
    [target, nodeInternals],
  );

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
  );
  // These values are all currently hard-coded for the size 50px
  // A more dynamic approach will be better in future

  const d =
    sourceNode.id !== targetNode.id
      ? getBezierPath({
          sourceX: sx,
          sourceY: sy,
          sourcePosition: sourcePos,
          targetPosition: targetPos,
          targetX: tx,
          targetY: ty,
          arch: data.arch,
        })
      : calcSelfLoop(
          sourceNode.position.x + 50,
          sourceNode.position.y + 25,
          targetNode.position.x + 25,
          targetNode.position.y,
        );

  const [edgeCenterX, edgeCenterY] =
    sourceNode.id !== targetNode.id
      ? getEdgeCenter({
          sourceX: sx,
          sourceY: sy,
          targetX: tx,
          targetY: ty,
        })
      : getEdgeCenter({
          sourceX: sourceNode.position.x + 75,
          sourceY: sourceNode.position.y - 10,
          targetX: targetNode.position.x + 40,
          targetY: targetNode.position.y,
        });

  return (
    <g className='react-flow__connection'>
      <path
        id={id}
        className='react-flow__edge-path'
        d={d}
        style={style as CSSProperties}
        markerEnd={markerEnd}
      />
      {!selected ? (
        <text className='react-flow__edge-textwrapper' onClick={handleClick}>
          <textPath
            href={`#${id}`}
            style={{ fontSize: '16px' }}
            startOffset='50%'
            textAnchor='middle'
          >
            {label}
          </textPath>
        </text>
      ) : (
        <foreignObject
          x={edgeCenterX - 50 / 2}
          y={edgeCenterY - 30 / 2}
          height={30}
          width={100}
        >
          <TextField
            inputRef={inputRef}
            autoFocus
            hiddenLabel
            id={`${id}-label-input`}
            variant='standard'
            defaultValue={label}
            onBlur={handleBlur}
            style={{ backgroundColor: 'transparent' }}
          />
        </foreignObject>
      )}
    </g>
  );
};

export default FloatingEdge;
