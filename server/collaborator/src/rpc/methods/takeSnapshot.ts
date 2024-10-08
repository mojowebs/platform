//
// Copyright © 2024 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

import {
  YDocVersion,
  collaborativeHistoryDocId,
  createYdocSnapshot,
  yDocFromStorage,
  yDocToStorage
} from '@hcengineering/collaboration'
import {
  parseDocumentId,
  type TakeSnapshotRequest,
  type TakeSnapshotResponse
} from '@hcengineering/collaborator-client'
import { CollaborativeDocVersionHead, MeasureContext, collaborativeDocParse, generateId } from '@hcengineering/core'
import { Doc as YDoc } from 'yjs'
import { Context } from '../../context'
import { RpcMethodParams } from '../rpc'

export async function takeSnapshot (
  ctx: MeasureContext,
  context: Context,
  payload: TakeSnapshotRequest,
  params: RpcMethodParams
): Promise<TakeSnapshotResponse> {
  const { documentId, snapshotName, createdBy } = payload
  const { hocuspocus, storageAdapter } = params
  const { workspaceId } = context

  const version: YDocVersion = {
    versionId: generateId(),
    name: snapshotName,
    createdBy,
    createdOn: Date.now()
  }

  const { collaborativeDoc } = parseDocumentId(documentId)
  const { documentId: contentDocumentId, versionId } = collaborativeDocParse(collaborativeDoc)
  if (versionId !== CollaborativeDocVersionHead) {
    throw new Error('invalid document version')
  }

  const connection = await ctx.with('connect', {}, async () => {
    return await hocuspocus.openDirectConnection(documentId, context)
  })

  try {
    // load history document directly from storage
    const historyDocumentId = collaborativeHistoryDocId(contentDocumentId)
    const yHistory =
      (await ctx.with('yDocFromStorage', {}, async () => {
        return await yDocFromStorage(ctx, storageAdapter, workspaceId, historyDocumentId)
      })) ?? new YDoc()

    await ctx.with('createYdocSnapshot', {}, async () => {
      await connection.transact((yContent) => {
        createYdocSnapshot(yContent, yHistory, version)
      })
    })

    await ctx.with('yDocToStorage', {}, async () => {
      await yDocToStorage(ctx, storageAdapter, workspaceId, historyDocumentId, yHistory)
    })

    return { ...version }
  } finally {
    await connection.disconnect()
  }
}
