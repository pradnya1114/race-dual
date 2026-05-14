/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { io, Socket } from 'socket.io-client';

// Initialize socket connection
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

export const socket: Socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
});
