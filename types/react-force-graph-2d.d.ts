declare module 'react-force-graph-2d' {
  import type { ComponentType } from 'react';

  export interface NodeObject {
    id: string;
    name?: string;
    type?: string;
    [key: string]: unknown;
  }

  export interface LinkObject {
    source: string | NodeObject;
    target: string | NodeObject;
    label?: string;
    [key: string]: unknown;
  }

  export interface GraphData {
    nodes: NodeObject[];
    links: LinkObject[];
  }

  export interface ForceGraph2DProps {
    graphData: GraphData;
    nodeLabel?: string | ((node: NodeObject) => string);
    nodeColor?: string | ((node: NodeObject) => string);
    linkLabel?: string | ((link: LinkObject) => string);
    width?: number;
    height?: number;
    nodeRelSize?: number;
    onNodeClick?: (node: NodeObject) => void;
    onLinkClick?: (link: LinkObject) => void;
    [key: string]: unknown;
  }

  const ForceGraph2D: ComponentType<ForceGraph2DProps>;
  export default ForceGraph2D;
}
