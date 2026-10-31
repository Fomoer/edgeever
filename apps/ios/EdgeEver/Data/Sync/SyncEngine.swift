import Foundation

actor SyncEngine {
    private let mirror: LocalMirrorRepository
    private let client: APIClient
    private var inFlight: [String: Task<Int, Error>] = [:]

    init(mirror: LocalMirrorRepository, client: APIClient) {
        self.mirror = mirror
        self.client = client
    }

    func sync(scope: String, onBootstrapProgress: (@Sendable (BootstrapProgress) -> Void)? = nil) async throws -> Int {
        if let existing = inFlight[scope] {
            return try await existing.value
        }
        let task = Task { try await performSync(scope: scope, onBootstrapProgress: onBootstrapProgress) }
        inFlight[scope] = task
        defer { inFlight[scope] = nil }
        return try await task.value
    }

    private func performSync(scope: String, onBootstrapProgress: (@Sendable (BootstrapProgress) -> Void)?) async throws -> Int {
        var cursor = try mirror.getCursor(scope: scope)
        var identity = try mirror.getIdentity(scope: scope)

        if cursor == nil || identity == nil {
            try mirror.clearRemoteMirrorPreservingLocal(scope: scope)
            var afterId: String?
            var loaded = 0
            var snapshotCursor = 0
            var snapshotTotalCount = 0
            var snapshotIdentity = "legacy"
            var firstPage = true

            while true {
                let page = try await client.getMobileSyncBootstrapPage(
                    afterId: afterId,
                    limit: SyncProtocol.bootstrapPageSize
                )
                if firstPage {
                    snapshotCursor = page.snapshotCursor
                    snapshotTotalCount = page.totalCount ?? 0
                    snapshotIdentity = page.syncIdentity ?? "legacy"
                    firstPage = false
                }
                let batches = SyncProtocol.splitBootstrapWriteBatches(
                    page.memos,
                    batchSize: SyncProtocol.bootstrapWriteBatchSize
                )
                for (index, batch) in batches.enumerated() {
                    try mirror.applyBootstrapBatch(
                        scope: scope,
                        notebooks: index == 0 ? page.notebooks : nil,
                        memos: batch
                    )
                    loaded += batch.count
                    onBootstrapProgress?(BootstrapProgress(loadedCount: loaded, totalCount: page.totalCount ?? snapshotTotalCount))
                }
                guard let next = page.nextAfterId else { break }
                afterId = next
            }
            cursor = snapshotCursor
            identity = snapshotIdentity
            try mirror.setCursor(scope: scope, cursor: snapshotCursor)
            try mirror.setIdentity(scope: scope, identity: snapshotIdentity)
        }

        var currentCursor = cursor ?? 0
        var currentIdentity = identity ?? "legacy"

        while true {
            let page = try await client.getMobileSyncChanges(
                cursor: currentCursor,
                limit: SyncProtocol.changePageSize
            )
            if SyncProtocol.hasCursorRewound(localCursor: currentCursor, serverCursor: page.serverCursor)
                || SyncProtocol.hasIdentityChanged(localIdentity: currentIdentity, serverIdentity: page.syncIdentity)
            {
                try mirror.clearSyncCursor(scope: scope)
                return try await performSync(scope: scope, onBootstrapProgress: onBootstrapProgress)
            }
            try mirror.applyChanges(scope: scope, changes: page.changes, cursor: page.cursor)
            currentCursor = page.cursor
            if !page.hasMore {
                return currentCursor
            }
        }
    }
}
