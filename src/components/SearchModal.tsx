import axios from 'axios'
import useSWR, { SWRResponse } from 'swr'
import { Dispatch, Fragment, SetStateAction, useState } from 'react'
import AwesomeDebouncePromise from 'awesome-debounce-promise'
import { useAsync } from 'react-async-hook'
import useConstant from 'use-constant'

import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Dialog, Transition } from '@headlessui/react'

import type { OdDriveItem, OdSearchResult } from '../types'
import { LoadingIcon } from './Loading'

import { getFileIcon } from '../utils/getFileIcon'
import { fetcher } from '../utils/fetchWithSWR'
import siteConfig from '../../config/site.config'

/**
 * Extract the searched item's path in field 'parentReference' and convert it to the
 * absolute path
 *
 * @param path Path returned from the parentReference field of the driveItem
 * @returns The absolute path of the driveItem in the search result
 */
function mapAbsolutePath(path: string): string {
  // path is in the format of '/drive/root:/path/to/file', if baseDirectory is '/' then we split on 'root:',
  // otherwise we split on the user defined 'baseDirectory'
  const absolutePath = path.split(siteConfig.baseDirectory === '/' ? 'root:' : siteConfig.baseDirectory)
  // path returned by the API may contain #, by doing a decodeURIComponent and then encodeURIComponent we can
  // replace URL sensitive characters such as the # with %23
  return absolutePath.length > 1 // solve https://github.com/spencerwooo/onedrive-vercel-index/issues/539
    ? absolutePath[1]
        .split('/')
        .map(p => encodeURIComponent(decodeURIComponent(p)))
        .join('/')
    : ''
}

/**
 * Implements a debounced search function that returns a promise that resolves to an array of
 * search results.
 *
 * @returns A react hook for a debounced async search of the drive
 */
function useDriveItemSearch() {
  const [query, setQuery] = useState('')
  const searchDriveItem = async (q: string) => {
    const { data } = await axios.get<OdSearchResult>(`/api/search?q=${q}`)

    // Map parentReference to the absolute path of the search result
    data.map(item => {
      item['path'] =
        'path' in item.parentReference
          ? // OneDrive International have the path returned in the parentReference field
            `${mapAbsolutePath(item.parentReference.path)}/${encodeURIComponent(item.name)}`
          : // OneDrive for Business/Education does not, so we need extra steps here
            ''
    })

    return data
  }

  const debouncedDriveItemSearch = useConstant(() => AwesomeDebouncePromise(searchDriveItem, 1000))
  const results = useAsync(async () => {
    if (query.length === 0) {
      return []
    } else {
      return debouncedDriveItemSearch(query)
    }
  }, [query])

  return {
    query,
    setQuery,
    results,
  }
}

function SearchResultItemTemplate({
  driveItem,
  driveItemPath,
  itemDescription,
  disabled,
}: {
  driveItem: OdSearchResult[number]
  driveItemPath: string
  itemDescription: string
  disabled: boolean
}) {
  return (
    <Link
      href={driveItemPath}
      passHref
      className={`group mx-2 flex items-center space-x-4 rounded-xl px-4 py-4 transition-all duration-200
        hover:bg-gray-100 hover:shadow-sm dark:hover:bg-gray-800
        ${disabled ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <FontAwesomeIcon
        icon={driveItem.file ? getFileIcon(driveItem.name) : ['far', 'folder']}
        className="h-5 w-5 text-gray-500 transition-colors group-hover:text-gray-900 dark:group-hover:text-white"
      />
      <div className="min-w-0 flex-1">
        <div className="text-base font-medium leading-6 transition-colors group-hover:text-gray-900 dark:group-hover:text-white">
          {driveItem.name}
        </div>
        <div
          className={`overflow-hidden truncate font-mono text-xs text-gray-500 dark:text-gray-400 ${
            itemDescription === 'Loading ...' && 'animate-pulse'
          }`}
        >
          {itemDescription}
        </div>
      </div>
    </Link>
  )
}

function SearchResultItemLoadRemote({ result }: { result: OdSearchResult[number] }) {
  const { data, error }: SWRResponse<OdDriveItem, { status: number; message: any }> = useSWR(
    [`/api/item?id=${result.id}`],
    fetcher
  )

  if (error) {
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={''}
        itemDescription={typeof error.message?.error === 'string' ? error.message.error : JSON.stringify(error.message)}
        disabled={true}
      />
    )
  }
  if (!data) {
    return (
      <SearchResultItemTemplate driveItem={result} driveItemPath={''} itemDescription={'Loading ...'} disabled={true} />
    )
  }

  const driveItemPath = `${mapAbsolutePath(data.parentReference.path)}/${encodeURIComponent(data.name)}`
  return (
    <SearchResultItemTemplate
      driveItem={result}
      driveItemPath={driveItemPath}
      itemDescription={decodeURIComponent(driveItemPath)}
      disabled={false}
    />
  )
}

function SearchResultItem({ result }: { result: OdSearchResult[number] }) {
  if (result.path === '') {
    // path is empty, which means we need to fetch the parentReference to get the path
    return <SearchResultItemLoadRemote result={result} />
  } else {
    // path is not an empty string in the search result, such that we can directly render the component as is
    const driveItemPath = decodeURIComponent(result.path)
    return (
      <SearchResultItemTemplate
        driveItem={result}
        driveItemPath={result.path}
        itemDescription={driveItemPath}
        disabled={false}
      />
    )
  }
}

export default function SearchModal({
  searchOpen,
  setSearchOpen,
}: {
  searchOpen: boolean
  setSearchOpen: Dispatch<SetStateAction<boolean>>
}) {
  const { query, setQuery, results } = useDriveItemSearch()

  const closeSearchBox = () => {
    setSearchOpen(false)
    setQuery('')
  }

  return (
    <Transition appear show={searchOpen} as={Fragment}>
      <Dialog
        as="div"
        className="fixed inset-0 z-[200] overflow-y-auto"
        onClose={closeSearchBox}
      >
        <div className="min-h-screen px-4 text-center">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Dialog.Overlay className="fixed inset-0 bg-black/20 backdrop-blur-sm" />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-4"
            enterTo="opacity-100 translate-y-0"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-4"
          >
            <div className="my-8 inline-block w-full max-w-3xl transform space-y-4">
              <div className="overflow-hidden rounded-2xl bg-white/80 shadow-lg transition-all dark:bg-gray-900/80">
                <Dialog.Title
                  as="h3"
                  className="flex items-center space-x-4 p-4 text-left"
                >
                  <FontAwesomeIcon icon="search" className="h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    id="search-box"
                    className="w-full bg-transparent text-base focus:outline-none focus-visible:outline-none"
                    placeholder={'Search ...'}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                  <div className="rounded-md bg-gray-200/50 px-2 py-1 text-xs font-medium dark:bg-gray-700/50">ESC</div>
                </Dialog.Title>
              </div>

              <div className="overflow-hidden rounded-2xl bg-white/80 shadow-lg transition-all dark:bg-gray-900/80">
                <div
                  className="max-h-[60vh] overflow-x-hidden overflow-y-scroll text-left
                    scrollbar-thin scrollbar-track-transparent
                    scrollbar-thumb-gray-200 hover:scrollbar-thumb-gray-300
                    dark:scrollbar-thumb-gray-700 dark:hover:scrollbar-thumb-gray-600"
                  onClick={closeSearchBox}
                >
                  {results.loading && (
                    <div className="px-6 py-8 text-center text-sm font-medium">
                      <LoadingIcon className="svg-inline--fa mr-2 inline-block h-4 w-4 animate-spin" />
                      <span>{'Loading ...'}</span>
                    </div>
                  )}
                  {results.error && (
                    <div className="px-6 py-8 text-center text-sm font-medium text-red-500">
                      {`Error: ${results.error.message}`}
                    </div>
                  )}
                  {results.result && (
                    <>
                      {results.result.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm font-medium">{'Nothing here.'}</div>
                      ) : (
                        results.result.map(result => <SearchResultItem key={result.id} result={result} />)
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}