'use client';

import dynamic from 'next/dynamic';
import type { GraphNode, GraphLink } from '@/lib/graph-writes';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface Props {
  nodes: GraphNode[];
  links: GraphLink[];
  width?: number;
  height?: number;
}

function nodeColor(n: { type?: string }): string {
  switch (n.type) {
    case 'Me':
      return '#7c3aed';
    case 'Person':
      return '#2563eb';
    case 'Company':
      return '#16a34a';
    default:
      return '#9ca3af';
  }
}

export default function ForceGraph({ nodes, links, width = 380, height = 400 }: Props) {
  // Transform to format ForceGraph2D expects
  const graphData = {
    nodes: nodes.map((n) => ({ ...n, name: n.label })),
    links: links.map((l) => ({ ...l })),
  };

  return (
    <ForceGraph2D
      graphData={graphData}
      nodeLabel="name"
      nodeColor={nodeColor}
      linkLabel="label"
      width={width}
      height={height}
      nodeRelSize={6}
    />
  );
}
