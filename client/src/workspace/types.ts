import type { Dispatch, SetStateAction } from "react";
import type { AppData } from "../types";

export type SetWorkspaceData = Dispatch<SetStateAction<AppData>>;
export type ReloadWorkspace = () => Promise<void>;
