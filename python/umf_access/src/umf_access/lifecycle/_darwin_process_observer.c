/* SPDX-License-Identifier: MIT OR Apache-2.0 */
/*
 * Source for the pinned Darwin process observer used by the local G11
 * PostgreSQL supervisor.  It is deliberately a tiny native helper instead of
 * a ctypes layout guess.  Build identity and this source are qualified
 * separately before the production adapter can be enabled.
 */
#include <errno.h>
#include <arpa/inet.h>
#include <libproc.h>
#include <netinet/in.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/sysctl.h>
#include <sys/time.h>
#include <unistd.h>

#define MAX_PIDS 65536
#define MAX_ARGS_BYTES (1024 * 1024)
#define MAX_ARGC 4096
#define MAX_FDS 65536

static void json_string(const char *s) {
    putchar('"');
    for (const unsigned char *p = (const unsigned char *)s; *p; ++p) {
        switch (*p) {
        case '"': fputs("\\\"", stdout); break;
        case '\\': fputs("\\\\", stdout); break;
        case '\n': fputs("\\n", stdout); break;
        case '\r': fputs("\\r", stdout); break;
        case '\t': fputs("\\t", stdout); break;
        default:
            if (*p < 0x20) printf("\\u%04x", (unsigned)*p);
            else putchar(*p);
        }
    }
    putchar('"');
}

static int process_args(pid_t pid, char ***out, int *count, char **storage) {
    int mib[3] = {CTL_KERN, KERN_PROCARGS2, pid};
    size_t size = 0;
    if (sysctl(mib, 3, NULL, &size, NULL, 0) != 0 || size < sizeof(int) ||
        size > MAX_ARGS_BYTES) return -1;
    char *buffer = calloc(1, size + 1);
    if (!buffer) return -1;
    if (sysctl(mib, 3, buffer, &size, NULL, 0) != 0 || size < sizeof(int)) {
        free(buffer);
        return -1;
    }
    int argc = 0;
    memcpy(&argc, buffer, sizeof(argc));
    if (argc < 0 || argc > MAX_ARGC) {
        free(buffer);
        return -1;
    }
    char *cursor = buffer + sizeof(int), *end = buffer + size;
    while (cursor < end && *cursor) ++cursor; /* executable path */
    while (cursor < end && !*cursor) ++cursor;
    char **args = calloc((size_t)argc + 1, sizeof(char *));
    if (!args) {
        free(buffer);
        return -1;
    }
    for (int i = 0; i < argc; ++i) {
        while (cursor < end && !*cursor) ++cursor;
        if (cursor >= end) {
            free(args);
            free(buffer);
            return -1;
        }
        args[i] = cursor;
        while (cursor < end && *cursor) ++cursor;
        if (cursor >= end) {
            free(args);
            free(buffer);
            return -1;
        }
        ++cursor;
    }
    *out = args;
    *count = argc;
    *storage = buffer;
    return 0;
}

static int emit_process(pid_t pid, int with_args) {
    struct proc_bsdinfo info;
    memset(&info, 0, sizeof(info));
    int got = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, sizeof(info));
    if (got != (int)sizeof(info)) return -1;
    char path[PROC_PIDPATHINFO_MAXSIZE];
    memset(path, 0, sizeof(path));
    int path_size = proc_pidpath(pid, path, sizeof(path));
    if (path_size <= 0 || path_size >= (int)sizeof(path)) return -1;
    printf("{\"pid\":%d,\"pgid\":%d,\"uid\":%u,\"gid\":%u,"
           "\"startSec\":%llu,\"startUsec\":%u,\"path\":",
           info.pbi_pid, info.pbi_pgid, info.pbi_uid, info.pbi_gid,
           (unsigned long long)info.pbi_start_tvsec, info.pbi_start_tvusec);
    json_string(path);
    if (with_args) {
        char **args = NULL;
        char *storage = NULL;
        int argc = 0;
        if (process_args(pid, &args, &argc, &storage) != 0) return -1;
        printf(",\"argv\":[");
        for (int i = 0; i < argc; ++i) {
            if (i) putchar(',');
            json_string(args[i]);
        }
        printf("]");
        free(storage);
        free(args);
    }
    putchar('}');
    return 0;
}

static int emit_one(pid_t pid) {
    struct timeval boot;
    size_t boot_size = sizeof(boot);
    if (sysctlbyname("kern.boottime", &boot, &boot_size, NULL, 0) != 0 ||
        boot_size != sizeof(boot)) return 2;
    printf("{\"profile\":\"umf.darwin-process-observer/0.1\","
           "\"bootSec\":%lld,\"bootUsec\":%lld,\"process\":",
           (long long)boot.tv_sec, (long long)boot.tv_usec);
    if (emit_process(pid, 1) != 0) return 3;
    puts("}");
    return 0;
}

static int emit_group(pid_t pgid) {
    pid_t *pids = calloc(MAX_PIDS, sizeof(pid_t));
    if (!pids) return 2;
    int bytes = proc_listpids(PROC_ALL_PIDS, 0, pids,
                              (int)(MAX_PIDS * sizeof(pid_t)));
    if (bytes <= 0 || bytes >= (int)(MAX_PIDS * sizeof(pid_t)) ||
        bytes % (int)sizeof(pid_t)) {
        free(pids);
        return 3;
    }
    printf("{\"profile\":\"umf.darwin-process-group-observer/0.1\","
           "\"pgid\":%d,\"processes\":[", pgid);
    int first = 1;
    for (int i = 0; i < bytes / (int)sizeof(pid_t); ++i) {
        if (pids[i] <= 0) continue;
        struct proc_bsdinfo info;
        memset(&info, 0, sizeof(info));
        int got = proc_pidinfo(pids[i], PROC_PIDTBSDINFO, 0, &info, sizeof(info));
        if (got == 0) continue; /* process exited between enumeration and read */
        if (got != (int)sizeof(info)) {
            free(pids);
            return 4;
        }
        if (info.pbi_pgid != pgid) continue;
        if (!first) putchar(',');
        first = 0;
        if (emit_process(pids[i], 1) != 0) {
            free(pids);
            return 5;
        }
    }
    puts("]}");
    free(pids);
    return 0;
}

static int emit_sockets(pid_t pgid) {
    pid_t *pids = calloc(MAX_PIDS, sizeof(pid_t));
    if (!pids) return 2;
    int bytes = proc_listpids(PROC_ALL_PIDS, 0, pids,
                              (int)(MAX_PIDS * sizeof(pid_t)));
    if (bytes <= 0 || bytes >= (int)(MAX_PIDS * sizeof(pid_t)) ||
        bytes % (int)sizeof(pid_t)) {
        free(pids);
        return 3;
    }
    printf("{\"profile\":\"umf.darwin-socket-group-observer/0.1\","
           "\"pgid\":%d,\"sockets\":[", pgid);
    int first = 1;
    for (int i = 0; i < bytes / (int)sizeof(pid_t); ++i) {
        if (pids[i] <= 0) continue;
        struct proc_bsdinfo process;
        memset(&process, 0, sizeof(process));
        int got = proc_pidinfo(pids[i], PROC_PIDTBSDINFO, 0, &process,
                               sizeof(process));
        if (got == 0) continue;
        if (got != (int)sizeof(process)) { free(pids); return 4; }
        if (process.pbi_pgid != pgid) continue;
        size_t fd_capacity = MAX_FDS * sizeof(struct proc_fdinfo);
        struct proc_fdinfo *fds = calloc(MAX_FDS, sizeof(struct proc_fdinfo));
        if (!fds) { free(pids); return 6; }
        int actual = proc_pidinfo(pids[i], PROC_PIDLISTFDS, 0, fds,
                                  (int)fd_capacity);
        if (actual <= 0 || actual >= (int)fd_capacity ||
            actual % (int)sizeof(struct proc_fdinfo)) {
            free(fds); free(pids); return 7;
        }
        for (int j = 0; j < actual / (int)sizeof(struct proc_fdinfo); ++j) {
            if (fds[j].proc_fdtype != PROX_FDTYPE_SOCKET) continue;
            struct socket_fdinfo socket;
            memset(&socket, 0, sizeof(socket));
            int socket_bytes = proc_pidfdinfo(pids[i], fds[j].proc_fd,
                                               PROC_PIDFDSOCKETINFO, &socket,
                                               sizeof(socket));
            if (socket_bytes != (int)sizeof(socket)) {
                free(fds); free(pids); return 8;
            }
            if (!first) putchar(',');
            first = 0;
            printf("{\"pid\":%d,\"fd\":%d,\"family\":%d,"
                   "\"kind\":%d,\"type\":%d,\"protocol\":%d,"
                   "\"state\":%d,\"listening\":%s,\"address\":",
                   pids[i], fds[j].proc_fd, socket.psi.soi_family,
                   socket.psi.soi_kind, socket.psi.soi_type,
                   socket.psi.soi_protocol,
                   socket.psi.soi_kind == SOCKINFO_TCP
                       ? socket.psi.soi_proto.pri_tcp.tcpsi_state : -1,
                   socket.psi.soi_kind == SOCKINFO_TCP &&
                           socket.psi.soi_proto.pri_tcp.tcpsi_state == TSI_S_LISTEN
                       ? "true" : "false");
            if (socket.psi.soi_kind == SOCKINFO_TCP &&
                socket.psi.soi_family == AF_INET) {
                char address[INET_ADDRSTRLEN] = {0};
                const void *source = &socket.psi.soi_proto.pri_tcp.tcpsi_ini
                    .insi_laddr.ina_46.i46a_addr4;
                if (!inet_ntop(AF_INET, source, address, sizeof(address))) {
                    free(fds); free(pids); return 9;
                }
                json_string(address);
                printf(",\"port\":%u", ntohs((uint16_t)socket.psi.soi_proto
                       .pri_tcp.tcpsi_ini.insi_lport));
                char peer[INET_ADDRSTRLEN] = {0};
                const void *peer_source = &socket.psi.soi_proto.pri_tcp.tcpsi_ini
                    .insi_faddr.ina_46.i46a_addr4;
                if (!inet_ntop(AF_INET, peer_source, peer, sizeof(peer))) {
                    free(fds); free(pids); return 11;
                }
                fputs(",\"peerAddress\":", stdout);
                json_string(peer);
            } else if (socket.psi.soi_kind == SOCKINFO_TCP &&
                       socket.psi.soi_family == AF_INET6) {
                char address[INET6_ADDRSTRLEN] = {0};
                const void *source = &socket.psi.soi_proto.pri_tcp.tcpsi_ini
                    .insi_laddr.ina_6;
                if (!inet_ntop(AF_INET6, source, address, sizeof(address))) {
                    free(fds); free(pids); return 10;
                }
                json_string(address);
                printf(",\"port\":%u", ntohs((uint16_t)socket.psi.soi_proto
                       .pri_tcp.tcpsi_ini.insi_lport));
                char peer[INET6_ADDRSTRLEN] = {0};
                const void *peer_source = &socket.psi.soi_proto.pri_tcp.tcpsi_ini
                    .insi_faddr.ina_6;
                if (!inet_ntop(AF_INET6, peer_source, peer, sizeof(peer))) {
                    free(fds); free(pids); return 12;
                }
                fputs(",\"peerAddress\":", stdout);
                json_string(peer);
            } else if (socket.psi.soi_kind == SOCKINFO_UN) {
                char path[sizeof(socket.psi.soi_proto.pri_un.unsi_addr.ua_sun.sun_path) + 1];
                memcpy(path, socket.psi.soi_proto.pri_un.unsi_addr.ua_sun.sun_path,
                       sizeof(path) - 1);
                path[sizeof(path) - 1] = '\0';
                json_string(path);
                fputs(",\"port\":null", stdout);
                fputs(",\"peerAddress\":null", stdout);
            } else {
                json_string("");
                fputs(",\"port\":null", stdout);
                fputs(",\"peerAddress\":null", stdout);
            }
            putchar('}');
        }
        free(fds);
    }
    puts("]}");
    free(pids);
    return 0;
}

int main(int argc, char **argv) {
    if (argc == 3 && strcmp(argv[1], "--pid") == 0) {
        char *end = NULL;
        long value = strtol(argv[2], &end, 10);
        if (!end || *end || value <= 0 || value > INT32_MAX) return 64;
        return emit_one((pid_t)value);
    }
    if (argc == 3 && strcmp(argv[1], "--pgid") == 0) {
        char *end = NULL;
        long value = strtol(argv[2], &end, 10);
        if (!end || *end || value <= 0 || value > INT32_MAX) return 64;
        return emit_group((pid_t)value);
    }
    if (argc == 3 && strcmp(argv[1], "--sockets") == 0) {
        char *end = NULL;
        long value = strtol(argv[2], &end, 10);
        if (!end || *end || value <= 0 || value > INT32_MAX) return 64;
        return emit_sockets((pid_t)value);
    }
    fputs("usage: process-observer (--pid PID | --pgid PGID)\n", stderr);
    return 64;
}
