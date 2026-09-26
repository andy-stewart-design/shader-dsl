#!/usr/bin/env node
import { startShdrLsp } from "./server.js";

startShdrLsp(process.stdin, process.stdout);
