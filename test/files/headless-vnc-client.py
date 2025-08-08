#!/usr/bin/env python3
"""
Minimal headless VNC client for testing VNC server connections.
Usage: python3 headless-vnc-client.py <host> <port> [--shared] [--timeout=10]
"""

import argparse
import socket
import struct
import sys
import time


class HeadlessVncClient:
    """Minimal headless VNC client for testing purposes"""

    def __init__(self, host, port, shared=False, timeout=10):
        self.host = host
        self.port = port
        self.shared = shared
        self.timeout = timeout
        self.socket = None
        self.connected = False

    def connect(self):
        """Establish VNC connection with minimal handshake"""
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.settimeout(self.timeout)
            self.socket.connect((self.host, self.port))

            # VNC protocol handshake
            # 1. Server sends protocol version
            protocol_version = self.socket.recv(12)
            if not protocol_version.startswith(b'RFB '):
                raise Exception(f"Invalid VNC protocol: {protocol_version}")

            print(f"Server protocol: {protocol_version.decode().strip()}")

            # 2. Send protocol version back
            self.socket.send(protocol_version)

            # 3. Receive security types
            security_types_count = struct.unpack('!B', self.socket.recv(1))[0]
            if security_types_count == 0:
                # Server error
                reason_length = struct.unpack('!I', self.socket.recv(4))[0]
                reason = self.socket.recv(reason_length)
                raise Exception(f"Server error: {reason.decode()}")

            security_types = self.socket.recv(security_types_count)
            print(f"Available security types: {list(security_types)}")

            # 4. Choose security type (1 = None/no auth, 2 = VNC auth)
            if 1 in security_types:
                print("Using no authentication")
                self.socket.send(struct.pack('!B', 1))
            elif 2 in security_types:
                print("VNC authentication required but not implemented in test client")
                self.socket.send(struct.pack('!B', 2))
                # For testing, we'll fail here if password is required
                self.socket.recv(16)  # challenge
                # Send empty response (will likely fail)
                self.socket.send(b'\x00' * 16)
            else:
                raise Exception("No supported security type")

            # 5. Security handshake result
            try:
                self.socket.settimeout(2)
                result_data = self.socket.recv(4)
                if len(result_data) == 4:
                    security_result = struct.unpack('!I', result_data)[0]
                    if security_result != 0:
                        # Try to read error message
                        try:
                            reason_length = struct.unpack('!I', self.socket.recv(4))[0]
                            reason = self.socket.recv(reason_length)
                            raise Exception(f"Security handshake failed: {reason.decode()}")
                        except Exception:
                            raise Exception(f"Security handshake failed: {security_result}") from None
                    print("Security handshake successful")
            except socket.timeout:
                # No security result sent, continue
                print("No security result received, continuing")
            finally:
                self.socket.settimeout(self.timeout)

            # 6. Send ClientInit message (shared flag)
            shared_flag = 1 if self.shared else 0
            self.socket.send(struct.pack('!B', shared_flag))
            print(f"Sent ClientInit with shared={self.shared}")

            # 7. Receive ServerInit message
            framebuffer_width = struct.unpack('!H', self.socket.recv(2))[0]
            framebuffer_height = struct.unpack('!H', self.socket.recv(2))[0]
            self.socket.recv(16)  # pixel_format - Skip pixel format details
            name_length = struct.unpack('!I', self.socket.recv(4))[0]
            name = self.socket.recv(name_length).decode()

            print(f"Connected to VNC server: {name} ({framebuffer_width}x{framebuffer_height})")
            self.connected = True
            return True

        except Exception as e:
            print(f"VNC connection failed: {e}")
            if self.socket:
                try:
                    self.socket.close()
                except Exception:
                    pass
            return False

    def keep_alive(self, duration=None):
        """Keep the connection alive for specified duration"""
        if not self.connected:
            return

        start_time = time.time()
        if duration:
            print(f"Keeping connection alive for {duration} seconds")
        else:
            print("Keeping connection alive indefinitely")

        try:
            while True:
                if duration and (time.time() - start_time) >= duration:
                    break

                # Send a simple message to keep connection alive
                # FramebufferUpdateRequest message
                # message_type=3, incremental=1, x=0, y=0, width=1, height=1
                update_request = struct.pack('!BBHHHH', 3, 1, 0, 0, 1, 1)
                self.socket.send(update_request)

                # Try to read any response (non-blocking)
                self.socket.settimeout(0.1)
                try:
                    data = self.socket.recv(1024)
                    if not data:
                        print("Server closed connection")
                        break
                except socket.timeout:
                    pass
                except Exception:
                    print("Connection lost")
                    break
                finally:
                    self.socket.settimeout(self.timeout)

                time.sleep(1)

        except KeyboardInterrupt:
            print("Interrupted by user")
        except Exception as e:
            print(f"Error during keep_alive: {e}")

    def disconnect(self):
        """Close VNC connection"""
        if self.socket:
            try:
                self.socket.close()
                print("Disconnected from VNC server")
            except Exception:
                pass
            self.socket = None
        self.connected = False


def main():
    parser = argparse.ArgumentParser(description='Headless VNC client for testing')
    parser.add_argument('host', help='VNC server host')
    parser.add_argument('port', type=int, help='VNC server port')
    parser.add_argument('--shared', action='store_true', help='Request shared connection')
    parser.add_argument('--timeout', type=int, default=10, help='Connection timeout in seconds')
    parser.add_argument('--duration', type=int, help='How long to keep connection alive (seconds)')

    args = parser.parse_args()

    client = HeadlessVncClient(args.host, args.port, args.shared, args.timeout)

    print(f"Connecting to VNC server at {args.host}:{args.port} (shared={args.shared})")

    if client.connect():
        print("Connection established successfully")
        client.keep_alive(args.duration)
    else:
        print("Failed to connect")
        sys.exit(1)

    client.disconnect()


if __name__ == '__main__':
    main()
