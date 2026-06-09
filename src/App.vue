<template>
  <main class="map-workspace">
    <div ref="mapContainer" class="map-container"></div>

    <section class="floating-panel floating-panel--search" @click.stop>
      <form class="place-search" @submit.prevent="searchPlaces">
        <input
          v-model.trim="placeSearchKeyword"
          type="search"
          placeholder="搜索地点"
          aria-label="搜索地点"
          @focus="showPlaceSearchHistory = true"
        />
        <button type="submit" :disabled="isPlaceSearchLoading">
          {{ isPlaceSearchLoading ? '搜索中' : '搜索' }}
        </button>
        <button type="button" :disabled="!placeSearchResults.length" @click="clearPlaceSearchResults">
          清除
        </button>
      </form>
      <div v-if="showPlaceSearchHistory && placeSearchHistories.length" class="place-search__history">
        <button
          v-for="keyword in filteredPlaceSearchHistories"
          :key="keyword"
          type="button"
          @click="selectPlaceSearchHistory(keyword)"
        >
          {{ keyword }}
        </button>
      </div>
      <div v-if="placeSearchResults.length" class="place-search__results">
        <button
          v-for="(place, index) in placeSearchResults"
          :key="place.id"
          type="button"
          class="place-search__item"
          :class="{ 'place-search__item--active': place.id === selectedSearchPlaceId }"
          @click="selectSearchPlace(place)"
        >
          <span class="place-search__index">{{ index + 1 }}</span>
          <span class="place-search__content">
            <strong>{{ place.name }}</strong>
            <em>最近地铁：{{ place.nearestMetroStation }} · {{ formatDistance(place.distanceToMetroMeters) }}</em>
          </span>
        </button>
      </div>
    </section>

    <section
      v-if="shouldShowStatusPanel"
      class="floating-panel floating-panel--status"
    >
      <div class="panel__header">
        <h1>租房找房地图</h1>
        <p>{{ activeConfigName }} · {{ markers.length }} 个标记</p>
      </div>
      <div v-if="!amapKey" class="notice notice--error">
        缺少 VITE_AMAP_KEY。请复制 .env.example 为 .env.local 并填写高德 Web JS API Key。
      </div>
      <div v-else-if="mapStatus" class="notice" :class="{ 'notice--error': hasMapError }">
        {{ mapStatus }}
      </div>
      <div v-if="storageStatusMessage" class="notice notice--error">
        {{ storageStatusMessage }}
      </div>
    </section>

    <section class="floating-panel floating-panel--tools">
      <button
        type="button"
        :class="{ 'button--active': interactionMode === 'draw-area' }"
        @click="startAreaSelection"
      >
        框选范围 R
      </button>
      <button type="button" @click="focusArea">回到范围</button>
      <button type="button" @click="exportConfig">保存 JSON</button>
      <button type="button" @click="openImportPicker">导入 JSON</button>
      <input
        ref="configFileInput"
        class="file-input"
        type="file"
        accept="application/json,.json"
        @change="importConfigFile"
      />
    </section>

    <section v-if="pendingAreaPath" class="floating-panel floating-panel--confirm">
      <div>
        <strong>确认锁定新范围</strong>
        <span>确认后地图会缩放到框选范围，并用该范围生成私有地图配置。</span>
      </div>
      <button type="button" @click="confirmAreaSelection">确定</button>
      <button type="button" @click="cancelAreaSelection">取消</button>
    </section>

    <section class="floating-panel floating-panel--markers">
      <div class="panel__title">
        <h2>房源标记</h2>
        <span>{{ markers.length }} 个</span>
      </div>
      <p class="helper">{{ selectedMarker ? getMarkerSummary(selectedMarker) : '未选择' }}</p>
      <div class="marker-list">
        <article
          v-for="marker in markers"
          :key="marker.id"
          class="marker-card"
          :class="{ 'marker-card--active': marker.id === selectedMarkerId }"
        >
          <button type="button" class="marker-card__content" @click="selectMarker(marker.id)">
            <strong>{{ getMarkerSummary(marker) }}</strong>
            <span v-if="marker.pros">优点：{{ marker.pros }}</span>
            <span v-if="marker.cons" class="marker-card__cons">缺点：{{ marker.cons }}</span>
            <span v-if="marker.isRejected" class="marker-card__rejected">垃圾小区，不能租用</span>
          </button>
          <button type="button" class="marker-card__delete" @click="deleteMarker(marker.id)">
            删除
          </button>
        </article>
      </div>
      <div class="route-actions">
        <button type="button" :disabled="!selectedMarker" @click="searchNearby('地铁站')">
          附近地铁
        </button>
        <button type="button" :disabled="!selectedMarker" @click="searchNearby('公交站')">
          附近公交
        </button>
        <button type="button" :disabled="!selectedMarker" @click="enablePickDestination">
          选点路线
        </button>
        <button type="button" @click="clearRoute">清除路线</button>
      </div>
      <div class="poi-list">
        <button
          v-for="poi in nearbyPois"
          :key="poi.id"
          type="button"
          class="poi-card"
          @click="planWalkingRoute(poi)"
        >
          <strong>{{ poi.name }}</strong>
          <span>{{ poi.address || '暂无地址' }}</span>
        </button>
      </div>
      <div id="route-panel" class="route-panel"></div>
    </section>

    <section v-if="showMarkerDialog" class="modal-backdrop" @click.self="closeMarkerDialog">
      <form class="marker-dialog" @click.stop @submit.prevent="savePendingMarker">
        <div class="panel__title">
          <h2>{{ editingMarkerId ? '编辑标记' : '添加标记' }}</h2>
          <button type="button" @click="closeMarkerDialog">关闭</button>
        </div>
        <p v-if="pendingMarkerPosition" class="helper">
          {{ pendingMarkerPosition[0].toFixed(6) }}, {{ pendingMarkerPosition[1].toFixed(6) }}
        </p>
        <label>
          优点
          <input v-model.trim="markerForm.pros" type="text" placeholder="例如：租金合适、通勤方便" />
        </label>
        <label>
          缺点
          <textarea
            v-model.trim="markerForm.cons"
            rows="4"
            placeholder="例如：动迁房、质量差、噪音大"
          ></textarea>
        </label>
        <label class="marker-dialog__checkbox">
          <input v-model="markerForm.isRejected" type="checkbox" />
          垃圾小区，不能租用
        </label>
        <button type="submit">{{ editingMarkerId ? '保存修改' : '保存标记' }}</button>
      </form>
    </section>
  </main>
</template>

<script lang="ts">
import AMapLoader from '@amap/amap-jsapi-loader'
import { defineComponent } from 'vue'

type AMapNamespace = Record<string, any>
type MapInstance = Record<string, any>
type InteractionMode = 'idle' | 'draw-area' | 'pick-route'
type AMapPluginName = 'AMap.MouseTool' | 'AMap.PlaceSearch' | 'AMap.Walking' | 'AMap.GeometryUtil'

interface RentalMarker {
  id: string
  pros: string
  cons: string
  isRejected: boolean
  position: [number, number]
}

interface NearbyPoi {
  id: string
  name: string
  address: string
  position: [number, number]
}

interface SearchPlace extends NearbyPoi {
  nearestMetroStation: string
  distanceToMetroMeters: number
}

interface MarkerForm {
  pros: string
  cons: string
  isRejected: boolean
  lng: string
  lat: string
}

interface BBox {
  west: number
  south: number
  east: number
  north: number
}

interface RentalMapConfig {
  version: 1
  name: string
  exportedAt: string
  area: {
    bbox: BBox
    path: Array<[number, number]>
  }
  markers: RentalMarker[]
}

interface MetroStation {
  id: string
  name: string
  position: [number, number]
}

const JIADING_BEI_STATION: [number, number] = [121.23735, 31.391549]
const JIADING_XI_STATION: [number, number] = [121.227855, 31.377107]
const BAIYIN_ROAD_STATION: [number, number] = [121.24535, 31.345359]
const JIADING_XINCHENG_STATION: [number, number] = [121.254294, 31.330062]
const MALU_STATION: [number, number] = [121.276906, 31.319675]
const CHENXIANG_HIGHWAY_STATION: [number, number] = [121.306787, 31.306484]
const NANXIANG_STATION: [number, number] = [121.323141, 31.296952]
const METRO_LINE_11_STATIONS: MetroStation[] = [
  {
    id: 'metro-jiading-bei',
    name: '嘉定北',
    position: JIADING_BEI_STATION,
  },
  {
    id: 'metro-jiading-xi',
    name: '嘉定西',
    position: JIADING_XI_STATION,
  },
  {
    id: 'metro-baiyin-road',
    name: '白银路',
    position: BAIYIN_ROAD_STATION,
  },
  {
    id: 'metro-jiading-xincheng',
    name: '嘉定新城',
    position: JIADING_XINCHENG_STATION,
  },
  {
    id: 'metro-malu',
    name: '马陆',
    position: MALU_STATION,
  },
  {
    id: 'metro-chenxiang-highway',
    name: '陈翔公路',
    position: CHENXIANG_HIGHWAY_STATION,
  },
  {
    id: 'metro-nanxiang',
    name: '南翔',
    position: NANXIANG_STATION,
  },
]
const PLACE_SEARCH_HISTORY_STORAGE_KEY = 'free-map:place-search-history'
const MARKER_STORAGE_KEY = 'free-map:rental-markers'
const MAX_PLACE_SEARCH_HISTORY_COUNT = 10
const DEFAULT_CENTER: [number, number] = [121.275498, 31.344251]
const DEFAULT_AREA: Array<[number, number]> = [
  [121.196303, 31.377107],
  [121.196909, 31.371849],
  [121.198704, 31.366794],
  [121.216199, 31.335046],
  [121.225143, 31.319749],
  [121.228059, 31.31509],
  [121.231983, 31.311006],
  [121.236764, 31.307654],
  [121.305611, 31.274544],
  [121.311066, 31.272054],
  [121.316985, 31.27052],
  [121.323141, 31.270003],
  [121.329297, 31.27052],
  [121.335216, 31.272054],
  [121.340671, 31.274544],
  [121.345452, 31.277896],
  [121.349376, 31.28198],
  [121.352292, 31.286639],
  [121.354087, 31.291694],
  [121.354693, 31.296952],
  [121.354087, 31.30221],
  [121.352292, 31.307265],
  [121.349376, 31.311924],
  [121.263585, 31.406521],
  [121.259661, 31.410605],
  [121.25488, 31.413957],
  [121.249425, 31.416447],
  [121.243506, 31.417981],
  [121.23735, 31.418498],
  [121.231194, 31.417981],
  [121.225275, 31.416447],
  [121.21982, 31.413957],
  [121.215039, 31.410605],
  [121.211115, 31.406521],
  [121.20162, 31.392079],
  [121.198704, 31.38742],
  [121.196909, 31.382365],
]

const DEFAULT_MARKERS: RentalMarker[] = [
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidLngLat(position: unknown): position is [number, number] {
  if (!Array.isArray(position) || position.length !== 2) {
    return false
  }

  const [lng, lat] = position
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  )
}

function calculateBBox(path: Array<[number, number]>): BBox {
  const lngs = path.map(([lng]) => lng)
  const lats = path.map(([, lat]) => lat)
  return {
    west: Math.min(...lngs),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    north: Math.max(...lats),
  }
}

function pathFromBBox(bbox: BBox): Array<[number, number]> {
  return [
    [bbox.west, bbox.south],
    [bbox.east, bbox.south],
    [bbox.east, bbox.north],
    [bbox.west, bbox.north],
  ]
}

function calculateDistanceMeters(start: [number, number], end: [number, number]) {
  const earthRadiusMeters = 6371008.8
  const toRadians = (degree: number) => (degree * Math.PI) / 180
  const startLat = toRadians(start[1])
  const endLat = toRadians(end[1])
  const deltaLat = toRadians(end[1] - start[1])
  const deltaLng = toRadians(end[0] - start[0])
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)))
}

function formatDistance(meters: number) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${meters} m`
}

function isValidBBox(value: unknown): value is BBox {
  if (!isRecord(value)) {
    return false
  }

  const { west, south, east, north } = value
  return (
    typeof west === 'number' &&
    typeof south === 'number' &&
    typeof east === 'number' &&
    typeof north === 'number' &&
    Number.isFinite(west) &&
    Number.isFinite(south) &&
    Number.isFinite(east) &&
    Number.isFinite(north) &&
    west >= -180 &&
    east <= 180 &&
    south >= -90 &&
    north <= 90 &&
    west < east &&
    south < north
  )
}

function isPointInPolygon(point: [number, number], polygon: Array<[number, number]>) {
  const [x, y] = point
  let inside = false

  for (let currentIndex = 0, previousIndex = polygon.length - 1; currentIndex < polygon.length; previousIndex = currentIndex++) {
    const [currentX, currentY] = polygon[currentIndex]
    const [previousX, previousY] = polygon[previousIndex]
    const crossesY = currentY > y !== previousY > y
    const intersectionX = ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX
    if (crossesY && x < intersectionX) {
      inside = !inside
    }
  }

  return inside
}

function normalizeConfig(rawConfig: unknown): RentalMapConfig {
  if (!isRecord(rawConfig)) {
    throw new Error('配置文件必须是 JSON 对象。')
  }

  const version = rawConfig.version
  if (version !== 1) {
    throw new Error('配置版本不支持。')
  }

  const name = typeof rawConfig.name === 'string' && rawConfig.name.trim() ? rawConfig.name.trim() : '导入地图'
  const area = rawConfig.area
  if (!isRecord(area)) {
    throw new Error('配置缺少 area 对象。')
  }

  const importedPath = Array.isArray(area.path) ? area.path : null
  let path: Array<[number, number]>
  if (importedPath) {
    if (importedPath.length < 3 || !importedPath.every(isValidLngLat)) {
      throw new Error('area.path 至少需要 3 个合法经纬度点。')
    }
    path = importedPath.map(([lng, lat]) => [lng, lat])
  } else if (isValidBBox(area.bbox)) {
    path = pathFromBBox(area.bbox)
  } else {
    throw new Error('配置必须包含合法的 area.path 或 area.bbox。')
  }

  const markers = rawConfig.markers
  if (!Array.isArray(markers)) {
    throw new Error('配置缺少 markers 数组。')
  }

  const normalizedMarkers = markers.map((marker, index): RentalMarker =>
    normalizeMarker(marker, index, path, '导入'),
  )

  const markerIds = new Set(normalizedMarkers.map((marker) => marker.id))
  if (markerIds.size !== normalizedMarkers.length) {
    throw new Error('Marker id 不能重复。')
  }

  return {
    version: 1,
    name,
    exportedAt: typeof rawConfig.exportedAt === 'string' ? rawConfig.exportedAt : new Date().toISOString(),
    area: {
      bbox: calculateBBox(path),
      path,
    },
    markers: normalizedMarkers,
  }
}

function normalizeMarker(
  rawMarker: unknown,
  index: number,
  areaPath: Array<[number, number]>,
  sourceName: string,
): RentalMarker {
  if (!isRecord(rawMarker)) {
    throw new Error(`第 ${index + 1} 个${sourceName} Marker 不是对象。`)
  }

  const id = rawMarker.id
  const position = rawMarker.position
  if (typeof id !== 'string' || !id.trim() || !isValidLngLat(position)) {
    throw new Error(`第 ${index + 1} 个${sourceName} Marker 数据不完整或坐标非法。`)
  }

  const normalizedPosition: [number, number] = [position[0], position[1]]
  if (!isPointInPolygon(normalizedPosition, areaPath)) {
    throw new Error(`第 ${index + 1} 个${sourceName} Marker 不在当前地图范围内。`)
  }

  const legacyTitle = typeof rawMarker.title === 'string' ? rawMarker.title.trim() : ''
  const legacyNote = typeof rawMarker.note === 'string' ? rawMarker.note.trim() : ''
  const pros = typeof rawMarker.pros === 'string' ? rawMarker.pros.trim() : legacyTitle
  const cons = typeof rawMarker.cons === 'string' ? rawMarker.cons.trim() : legacyNote
  const isRejected = typeof rawMarker.isRejected === 'boolean' ? rawMarker.isRejected : false

  return {
    id: id.trim(),
    pros,
    cons,
    isRejected,
    position: normalizedPosition,
  }
}

function createLogger(scope: string) {
  return {
    info(message: string, payload?: unknown) {
      console.info(`[${scope}] ${message}`, payload ?? '')
    },
    warn(message: string, payload?: unknown) {
      console.warn(`[${scope}] ${message}`, payload ?? '')
    },
    error(message: string, payload?: unknown) {
      console.error(`[${scope}] ${message}`, payload ?? '')
    },
  }
}

function getNow() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

export default defineComponent({
  name: 'App',
  data() {
    return {
      AMap: null as AMapNamespace | null,
      map: null as MapInstance | null,
      areaPolygon: null as any,
      areaOutsideMaskPolygon: null as any,
      metroStationMarkers: [] as any[],
      mouseTool: null as any,
      pendingAreaRectangle: null as any,
      areaPath: DEFAULT_AREA.map((position) => [...position]) as Array<[number, number]>,
      pendingAreaPath: null as Array<[number, number]> | null,
      mapMoveStartedAt: 0,
      activeConfigName: '11号线嘉定北-南翔 3km 范围',
      amapKey: import.meta.env.VITE_AMAP_KEY ?? '',
      hasMapError: false,
      mapStatus: '地图 SDK 加载中...',
      storageStatusMessage: '',
      markerForm: {
        pros: '',
        cons: '',
        isRejected: false,
        lng: String(DEFAULT_CENTER[0]),
        lat: String(DEFAULT_CENTER[1]),
      } as MarkerForm,
      markers: [...DEFAULT_MARKERS] as RentalMarker[],
      markerInstances: new Map<string, any>(),
      pluginLoadPromises: new Map<AMapPluginName, Promise<void>>(),
      selectedMarkerId: DEFAULT_MARKERS[0]?.id ?? '',
      editingMarkerId: '',
      pendingMarkerPosition: null as [number, number] | null,
      pendingMarkerInstance: null as any,
      showMarkerDialog: false,
      nearbyPois: [] as NearbyPoi[],
      placeSearchKeyword: '',
      placeSearchResults: [] as SearchPlace[],
      placeSearchMarkers: [] as any[],
      selectedSearchPlaceId: '',
      placeSearchHistories: [] as string[],
      showPlaceSearchHistory: false,
      isPlaceSearchLoading: false,
      poiMarkers: [] as any[],
      walkingRoute: null as any,
      interactionMode: 'idle' as InteractionMode,
      logger: createLogger('RentalMap'),
    }
  },
  computed: {
    selectedMarker(): RentalMarker | undefined {
      return this.markers.find((marker) => marker.id === this.selectedMarkerId)
    },
    shouldShowStatusPanel(): boolean {
      return (
        !this.amapKey ||
        this.hasMapError ||
        this.interactionMode !== 'idle' ||
        Boolean(this.pendingAreaPath) ||
        Boolean(this.storageStatusMessage)
      )
    },
    filteredPlaceSearchHistories(): string[] {
      const keyword = this.placeSearchKeyword.trim()
      if (!keyword) {
        return this.placeSearchHistories
      }
      return this.placeSearchHistories.filter((history) => history.includes(keyword))
    },
  },
  mounted() {
    this.checkLocalStorageAvailability()
    this.loadPlaceSearchHistories()
    this.loadStoredMarkers()
    void this.initializeMap()
    window.addEventListener('keydown', this.handleKeyboardShortcut)
  },
  beforeUnmount() {
    this.logger.info('销毁地图实例')
    window.removeEventListener('keydown', this.handleKeyboardShortcut)
    this.map?.destroy?.()
  },
  methods: {
    async initializeMap() {
      if (!this.amapKey) {
        this.hasMapError = true
        this.mapStatus = '缺少高德地图 Key，地图无法初始化。'
        this.logger.warn('初始化中止：缺少 VITE_AMAP_KEY')
        return
      }

      const securityCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE
      if (securityCode) {
        window._AMapSecurityConfig = { securityJsCode: securityCode }
      }

      try {
        this.logger.info('开始加载高德 JS SDK', {
          hasKey: Boolean(this.amapKey),
          hasSecurityCode: Boolean(securityCode),
        })
        const sdkLoadStartedAt = getNow()
        this.AMap = await AMapLoader.load({
          key: this.amapKey,
          version: '2.0',
          plugins: ['AMap.Scale', 'AMap.ToolBar'],
        })
        this.logger.info('高德 JS SDK 基础能力加载完成', {
          durationMs: Math.round(getNow() - sdkLoadStartedAt),
          plugins: ['AMap.Scale', 'AMap.ToolBar'],
        })
        this.createMap()
        this.mapStatus = '地图已就绪。'
        this.hasMapError = false
      } catch (error) {
        this.hasMapError = true
        this.mapStatus = '地图 SDK 加载失败，请检查 Key、服务权限、网络或安全密钥配置。'
        this.logger.error('高德 JS SDK 加载失败', error)
      }
    },
    createMap() {
      if (!this.AMap || !this.$refs.mapContainer) {
        this.logger.warn('创建地图失败：AMap 或容器不存在', {
          hasAMap: Boolean(this.AMap),
          hasContainer: Boolean(this.$refs.mapContainer),
        })
        return
      }

      const AMap = this.AMap
      const mapCreateStartedAt = getNow()
      const map = new AMap.Map(this.$refs.mapContainer as HTMLDivElement, {
        center: DEFAULT_CENTER,
        zoom: 13,
        resizeEnable: true,
        animateEnable: false,
        viewMode: '2D',
      })
      this.map = map

      map.addControl(new AMap.Scale())
      map.addControl(new AMap.ToolBar({ position: 'RB' }))
      this.bindMapEvents()
      map.on?.('complete', () => {
        this.logger.info('高德地图首帧渲染完成', {
          durationMs: Math.round(getNow() - mapCreateStartedAt),
        })
        this.renderInitialOverlays()
      })
      this.logger.info('地图创建完成', {
        center: DEFAULT_CENTER,
        markerCount: this.markers.length,
      })
    },
    renderInitialOverlays() {
      const renderStartedAt = getNow()
      this.renderArea()
      this.renderMetroHighlights()
      this.renderMarkers()
      this.focusArea()
      this.logger.info('地图初始覆盖物渲染完成', {
        durationMs: Math.round(getNow() - renderStartedAt),
        areaPointCount: this.areaPath.length,
        markerCount: this.markers.length,
      })
    },
    async ensureAmapPlugin(pluginName: AMapPluginName) {
      if (!this.AMap) {
        this.logger.warn('插件加载失败：AMap 尚未初始化', { pluginName })
        return false
      }

      const namespaceKey = pluginName.split('.')[1]
      if (namespaceKey && this.AMap[namespaceKey]) {
        return true
      }

      const existingPromise = this.pluginLoadPromises.get(pluginName)
      if (existingPromise) {
        await existingPromise
        return Boolean(namespaceKey && this.AMap[namespaceKey])
      }

      const pluginLoadStartedAt = getNow()
      const pluginPromise = new Promise<void>((resolve, reject) => {
        try {
          this.AMap?.plugin(pluginName, () => resolve())
        } catch (error) {
          reject(error)
        }
      })
      this.pluginLoadPromises.set(pluginName, pluginPromise)

      try {
        await pluginPromise
        this.logger.info('高德插件按需加载完成', {
          pluginName,
          durationMs: Math.round(getNow() - pluginLoadStartedAt),
        })
        return Boolean(namespaceKey && this.AMap[namespaceKey])
      } catch (error) {
        this.pluginLoadPromises.delete(pluginName)
        this.logger.error('高德插件按需加载失败', { pluginName, error })
        return false
      }
    },
    bindMapEvents() {
      this.map?.on('click', (event: any) => {
        const clickedPosition = this.toPosition(event.lnglat)
        if (!isValidLngLat(clickedPosition)) {
          this.mapStatus = '无法读取点击位置，请重新点击地图。'
          this.hasMapError = true
          this.logger.warn('地图点击未返回合法坐标', { lnglat: event.lnglat, clickedPosition })
          return
        }

        if (this.interactionMode === 'pick-route' && this.selectedMarker) {
          this.interactionMode = 'idle'
          this.logger.info('地图选点路线规划', {
            marker: this.selectedMarker.id,
            destination: clickedPosition,
          })
          this.planRouteToPosition(clickedPosition)
          return
        }

        if (this.interactionMode === 'draw-area') {
          return
        }

        this.openMarkerDialog(clickedPosition)
      })
      this.map?.on('movestart', this.trackMapMoveStart)
      this.map?.on('moveend', this.trackMapMoveEnd)
      this.map?.on('zoomstart', this.trackMapMoveStart)
      this.map?.on('zoomend', this.trackMapMoveEnd)
    },
    trackMapMoveStart() {
      this.mapMoveStartedAt = getNow()
      this.logger.info('地图移动开始', {
        areaPointCount: this.areaPath.length,
      })
    },
    trackMapMoveEnd() {
      const durationMs = this.mapMoveStartedAt ? Math.round(getNow() - this.mapMoveStartedAt) : 0
      this.mapMoveStartedAt = 0
      this.logger.info('地图移动结束', {
        durationMs,
        areaPointCount: this.areaPath.length,
      })
    },
    handleKeyboardShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName?.toLowerCase()
      if (tagName === 'input' || tagName === 'textarea') {
        return
      }

      if (event.key === 'Escape') {
        this.cancelCurrentInteraction()
        return
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        this.startAreaSelection()
        return
      }

    },
    cancelCurrentInteraction() {
      this.closeMouseTool()
      this.clearPendingArea()
      this.closeMarkerDialog()
      this.interactionMode = 'idle'
      this.mapStatus = '已取消当前操作。'
      this.hasMapError = false
      this.logger.info('取消当前交互')
    },
    closeMouseTool() {
      this.mouseTool?.close?.(false)
    },
    async startAreaSelection() {
      if (!this.AMap || !this.map) {
        this.mapStatus = '地图绘制工具未就绪。'
        this.hasMapError = true
        this.logger.warn('框选范围失败：MouseTool 未就绪', {
          hasAMap: Boolean(this.AMap),
          hasMap: Boolean(this.map),
          hasMouseTool: Boolean(this.mouseTool),
        })
        return
      }

      if (!this.mouseTool) {
        this.mapStatus = '正在加载地图绘制工具...'
        this.hasMapError = false
        const hasMouseTool = await this.ensureAmapPlugin('AMap.MouseTool')
        if (!hasMouseTool || !this.AMap?.MouseTool || !this.map) {
          this.mapStatus = '地图绘制工具加载失败。'
          this.hasMapError = true
          this.logger.warn('框选范围失败：MouseTool 加载后仍不可用', {
            hasMouseTool,
            hasAMapMouseTool: Boolean(this.AMap?.MouseTool),
            hasMap: Boolean(this.map),
          })
          return
        }
        this.mouseTool = new this.AMap.MouseTool(this.map)
      }

      this.clearPendingArea()
      this.clearRoute()
      this.clearPoiMarkers()
      this.interactionMode = 'draw-area'
      this.mapStatus = '拖拽框选找房范围，松开鼠标后点击确定锁定。'
      this.hasMapError = false

      this.mouseTool.off?.('draw')
      this.mouseTool.on('draw', (event: any) => {
        const path = this.getPathFromRectangle(event.obj)
        if (!path) {
          this.mapStatus = '无法读取框选范围，请重新框选。'
          this.hasMapError = true
          this.logger.warn('框选结束但无法解析矩形路径', event)
          return
        }

        this.pendingAreaRectangle?.setMap?.(null)
        this.pendingAreaRectangle = event.obj
        this.pendingAreaPath = path
        this.closeMouseTool()
        this.mapStatus = '范围已框选，点击确定锁定该私有地图范围。'
        this.hasMapError = false
        this.logger.info('框选范围完成', {
          bbox: calculateBBox(path),
          path,
        })
      })

      this.mouseTool.rectangle({
        strokeColor: '#127C72',
        strokeWeight: 2,
        strokeOpacity: 0.95,
        fillOpacity: 0,
      })
      this.logger.info('进入框选范围模式')
    },
    getPathFromRectangle(rectangle: any): Array<[number, number]> | null {
      const bounds = rectangle?.getBounds?.()
      if (!bounds) {
        return null
      }

      const southWest = bounds.getSouthWest?.()
      const northEast = bounds.getNorthEast?.()
      if (!southWest || !northEast) {
        return null
      }

      const [west, south] = this.toPosition(southWest)
      const [east, north] = this.toPosition(northEast)
      const bbox = { west, south, east, north }
      if (!isValidBBox(bbox)) {
        return null
      }

      return pathFromBBox(bbox)
    },
    confirmAreaSelection() {
      if (!this.pendingAreaPath) {
        this.mapStatus = '没有待确认的框选范围。'
        this.hasMapError = true
        this.logger.warn('确认框选失败：pendingAreaPath 为空')
        return
      }

      const nextArea = this.pendingAreaPath.map(([lng, lat]) => [lng, lat]) as Array<[number, number]>
      const remainingMarkers = this.markers.filter((marker) => isPointInPolygon(marker.position, nextArea))
      const removedMarkerCount = this.markers.length - remainingMarkers.length
      this.areaPath = nextArea
      this.markers = remainingMarkers
      this.selectedMarkerId = this.markers[0]?.id ?? ''
      this.activeConfigName = '私有地图'
      this.interactionMode = 'idle'
      this.clearPendingArea()
      this.clearRoute()
      this.clearPoiMarkers()

      this.renderArea()
      this.renderMetroHighlights()
      this.renderMarkers()
      this.focusArea()
      this.persistMarkers()
      this.mapStatus = removedMarkerCount
        ? `已锁定范围，移除了 ${removedMarkerCount} 个范围外标记。`
        : '已锁定范围。'
      this.hasMapError = false
      this.logger.info('确认锁定新范围', {
        bbox: calculateBBox(this.areaPath),
        markerCount: this.markers.length,
        removedMarkerCount,
      })
    },
    cancelAreaSelection() {
      this.clearPendingArea()
      this.interactionMode = 'idle'
      this.mapStatus = '已取消框选范围。'
      this.hasMapError = false
      this.logger.info('取消框选范围')
    },
    clearPendingArea() {
      this.pendingAreaRectangle?.setMap?.(null)
      this.pendingAreaRectangle = null
      this.pendingAreaPath = null
    },
    renderArea() {
      if (!this.AMap || !this.map) {
        return
      }

      this.areaPolygon?.setMap?.(null)
      this.areaOutsideMaskPolygon?.setMap?.(null)
      this.areaOutsideMaskPolygon = new this.AMap.Polygon({
        path: [
          [
            [-180, 85],
            [180, 85],
            [180, -85],
            [-180, -85],
          ],
          this.areaPath,
        ],
        strokeOpacity: 0,
        fillColor: '#1f2933',
        fillOpacity: 0.28,
        bubble: true,
        zIndex: 8,
      })
      this.areaPolygon = new this.AMap.Polygon({
        path: this.areaPath,
        strokeColor: '#127C72',
        strokeWeight: 3,
        strokeOpacity: 1,
        fillOpacity: 0,
        bubble: true,
        zIndex: 10,
      })
      this.map.add(this.areaOutsideMaskPolygon)
      this.map.add(this.areaPolygon)
    },
    renderMetroHighlights() {
      if (!this.AMap || !this.map) {
        return
      }
      const AMap = this.AMap
      const map = this.map

      this.metroStationMarkers.forEach((marker) => marker.setMap(null))
      this.metroStationMarkers = []

      this.metroStationMarkers = METRO_LINE_11_STATIONS.map((station) => {
        const stationNode = document.createElement('div')
        stationNode.className = 'metro-station-label'
        const lineNode = document.createElement('strong')
        lineNode.textContent = '11'
        const nameNode = document.createElement('span')
        nameNode.textContent = station.name
        stationNode.append(lineNode, nameNode)

        const marker = new AMap.Marker({
          position: station.position,
          anchor: 'bottom-center',
          content: stationNode,
          bubble: false,
          zIndex: 13,
        })
        map.add(marker)
        return marker
      })

      this.logger.info('地铁重点展示层渲染完成', {
        stationCount: METRO_LINE_11_STATIONS.length,
      })
    },
    renderMarkers() {
      if (!this.AMap || !this.map) {
        return
      }
      const AMap = this.AMap
      const map = this.map

      this.markerInstances.forEach((instance) => instance.setMap(null))
      this.markerInstances.clear()

      this.markers.forEach((marker) => {
        const markerNode = document.createElement('div')
        markerNode.className = `custom-marker${marker.isRejected ? ' custom-marker--rejected' : ''}`
        const prosNode = document.createElement('strong')
        prosNode.textContent = marker.pros || '未填写优点'
        const consNode = document.createElement('span')
        consNode.className = 'custom-marker__cons'
        consNode.textContent = marker.cons || '未填写缺点'
        const deleteButton = document.createElement('button')
        deleteButton.className = 'custom-marker__delete'
        deleteButton.type = 'button'
        deleteButton.title = '删除标记'
        deleteButton.setAttribute('aria-label', `删除标记：${this.getMarkerSummary(marker)}`)
        deleteButton.textContent = '×'
        deleteButton.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.deleteMarker(marker.id)
        })
        markerNode.append(prosNode, consNode, deleteButton)

        const instance = new AMap.Marker({
          position: marker.position,
          anchor: 'bottom-center',
          content: markerNode,
          extData: marker,
        })
        instance.on('click', () => this.openMarkerEditDialog(marker.id))
        map.add(instance)
        this.markerInstances.set(marker.id, instance)
      })
    },
    focusArea() {
      if (!this.map) {
        return
      }
      const bounds = this.getAreaBounds()
      if (!bounds) {
        this.logger.warn('无法聚焦范围：边界计算为空')
        return
      }
      this.map.setBounds(bounds, false, [48, 48, 48, 48])
    },
    getAreaBounds() {
      if (!this.AMap || this.areaPath.length === 0) {
        return null
      }

      const lngs = this.areaPath.map(([lng]) => lng)
      const lats = this.areaPath.map(([, lat]) => lat)
      return new this.AMap.Bounds(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      )
    },
    exportConfig() {
      const config: RentalMapConfig = {
        version: 1,
        name: this.activeConfigName,
        exportedAt: new Date().toISOString(),
        area: {
          bbox: calculateBBox(this.areaPath),
          path: this.areaPath.map(([lng, lat]) => [lng, lat]),
        },
        markers: this.markers.map((marker) => ({
          id: marker.id,
          pros: marker.pros,
          cons: marker.cons,
          isRejected: marker.isRejected,
          position: [marker.position[0], marker.position[1]],
        })),
      }
      const fileContent = JSON.stringify(config, null, 2)
      const blob = new Blob([fileContent], { type: 'application/json;charset=utf-8' })
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const datePart = new Date().toISOString().slice(0, 10)
      link.href = objectUrl
      link.download = `rental-map-${datePart}.json`
      link.click()
      URL.revokeObjectURL(objectUrl)
      this.mapStatus = '当前地图配置已导出。'
      this.hasMapError = false
      this.logger.info('导出地图配置', {
        bbox: config.area.bbox,
        areaPointCount: config.area.path.length,
        markerCount: config.markers.length,
      })
    },
    openImportPicker() {
      const input = this.$refs.configFileInput as HTMLInputElement | undefined
      if (!input) {
        this.mapStatus = '导入控件未就绪。'
        this.hasMapError = true
        this.logger.warn('打开导入文件选择器失败：input 不存在')
        return
      }
      input.value = ''
      input.click()
    },
    async importConfigFile(event: Event) {
      const input = event.target as HTMLInputElement | null
      const file = input?.files?.[0]
      if (!file) {
        this.logger.info('导入已取消：未选择文件')
        return
      }

      this.logger.info('开始导入地图配置文件', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      })

      try {
        const fileText = await file.text()
        const parsedConfig = JSON.parse(fileText) as unknown
        const config = normalizeConfig(parsedConfig)
        this.applyImportedConfig(config)
      } catch (error) {
        const message = error instanceof Error ? error.message : '配置导入失败。'
        this.mapStatus = message
        this.hasMapError = true
        this.logger.error('导入地图配置失败', error)
      } finally {
        if (input) {
          input.value = ''
        }
      }
    },
    applyImportedConfig(config: RentalMapConfig) {
      this.clearRoute()
      this.clearPoiMarkers()
      this.clearPendingArea()
      this.areaPath = config.area.path.map(([lng, lat]) => [lng, lat])
      this.activeConfigName = config.name
      this.markers = config.markers.map((marker) => ({
        id: marker.id,
        pros: marker.pros,
        cons: marker.cons,
        isRejected: marker.isRejected,
        position: [marker.position[0], marker.position[1]],
      }))
      this.selectedMarkerId = this.markers[0]?.id ?? ''
      this.nearbyPois = []
      this.interactionMode = 'idle'
      this.closeMarkerDialog()

      if (this.map) {
        this.renderArea()
        this.renderMetroHighlights()
        this.renderMarkers()
        this.focusArea()
      }
      this.persistMarkers()

      this.mapStatus = `已导入私有地图：${config.name}。`
      this.hasMapError = false
      this.logger.info('导入地图配置成功', {
        name: config.name,
        bbox: config.area.bbox,
        markerCount: config.markers.length,
      })
    },
    async openMarkerDialog(position: [number, number]) {
      const isInsideArea = await this.isInsideArea(position)
      if (!isInsideArea) {
        this.mapStatus = '点击位置不在当前找房范围内。'
        this.hasMapError = true
        this.logger.warn('打开标记弹窗失败：位置超出范围', { position })
        return
      }

      this.editingMarkerId = ''
      this.pendingMarkerPosition = position
      this.markerForm.pros = ''
      this.markerForm.cons = ''
      this.markerForm.isRejected = false
      this.renderPendingMarker(position)
      this.showMarkerDialog = true
      this.mapStatus = '已选择标记位置，可填写优点、缺点并标记是否不能租用。'
      this.hasMapError = false
      this.logger.info('地图点击创建临时标记并打开弹窗', { position })
    },
    openMarkerEditDialog(markerId: string) {
      const marker = this.markers.find((item) => item.id === markerId)
      if (!marker) {
        this.logger.warn('打开编辑弹窗失败：标记不存在', { markerId })
        return
      }

      this.selectedMarkerId = marker.id
      this.map?.setCenter(marker.position)
      this.clearRoute()
      this.clearPoiMarkers()
      this.clearPendingMarker()
      this.editingMarkerId = marker.id
      this.pendingMarkerPosition = [marker.position[0], marker.position[1]]
      this.markerForm.pros = marker.pros
      this.markerForm.cons = marker.cons
      this.markerForm.isRejected = marker.isRejected
      this.showMarkerDialog = true
      this.mapStatus = '正在编辑标记。'
      this.hasMapError = false
      this.logger.info('打开标记编辑弹窗', marker)
    },
    renderPendingMarker(position: [number, number]) {
      if (!this.AMap || !this.map) {
        this.logger.warn('临时标记渲染失败：AMap 或地图不存在', {
          hasAMap: Boolean(this.AMap),
          hasMap: Boolean(this.map),
          position,
        })
        return
      }

      this.clearPendingMarker()
      const markerNode = document.createElement('div')
      markerNode.className = 'custom-marker custom-marker--pending'
      markerNode.innerHTML = '<strong>新标记</strong><span>待填写</span>'
      this.pendingMarkerInstance = new this.AMap.Marker({
        position,
        anchor: 'bottom-center',
        content: markerNode,
      })
      this.map.add(this.pendingMarkerInstance)
    },
    clearPendingMarker() {
      this.pendingMarkerInstance?.setMap?.(null)
      this.pendingMarkerInstance = null
    },
    closeMarkerDialog() {
      this.showMarkerDialog = false
      this.editingMarkerId = ''
      this.pendingMarkerPosition = null
      this.markerForm.pros = ''
      this.markerForm.cons = ''
      this.markerForm.isRejected = false
      this.clearPendingMarker()
    },
    async savePendingMarker() {
      const pros = this.markerForm.pros.trim()
      const cons = this.markerForm.cons.trim()
      const isRejected = this.markerForm.isRejected
      const position = this.pendingMarkerPosition

      if (!position) {
        this.mapStatus = '缺少标记位置，请重新点击地图。'
        this.hasMapError = true
        this.logger.warn('保存标记失败：pendingMarkerPosition 为空')
        return
      }

      const isInsideArea = await this.isInsideArea(position)
      if (!isInsideArea) {
        this.mapStatus = '标记坐标不在当前找房范围内。'
        this.hasMapError = true
        this.logger.warn('保存标记失败：坐标超出范围', { position })
        return
      }

      const editingMarker = this.editingMarkerId
        ? this.markers.find((marker) => marker.id === this.editingMarkerId)
        : null
      if (this.editingMarkerId && !editingMarker) {
        this.mapStatus = '要编辑的标记不存在。'
        this.hasMapError = true
        this.logger.warn('保存标记失败：编辑目标不存在', { editingMarkerId: this.editingMarkerId })
        return
      }

      let savedMarker: RentalMarker
      if (editingMarker) {
        editingMarker.pros = pros
        editingMarker.cons = cons
        editingMarker.isRejected = isRejected
        savedMarker = editingMarker
      } else {
        savedMarker = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          pros,
          cons,
          isRejected,
          position,
        }
        this.markers.push(savedMarker)
      }
      this.selectedMarkerId = savedMarker.id
      this.nearbyPois = []
      this.closeMarkerDialog()
      this.interactionMode = 'idle'
      this.renderMarkers()
      this.persistMarkers()
      this.map?.setCenter(savedMarker.position)
      this.mapStatus = editingMarker ? '标记已更新。' : '标记已添加。'
      this.hasMapError = false
      this.logger.info(editingMarker ? '编辑标记成功' : '新增标记成功', savedMarker)
    },
    deleteMarker(markerId: string) {
      const beforeCount = this.markers.length
      this.markers = this.markers.filter((marker) => marker.id !== markerId)
      if (beforeCount === this.markers.length) {
        this.logger.warn('删除标记失败：标记不存在', { markerId })
        return
      }

      if (this.selectedMarkerId === markerId) {
        this.selectedMarkerId = this.markers[0]?.id ?? ''
        this.clearRoute()
        this.clearPoiMarkers()
      }

      this.renderMarkers()
      this.persistMarkers()
      this.mapStatus = '标记已删除。'
      this.hasMapError = false
      this.logger.info('删除标记成功', { markerId })
    },
    selectMarker(markerId: string) {
      const marker = this.markers.find((item) => item.id === markerId)
      if (!marker) {
        this.logger.warn('选择标记失败：标记不存在', { markerId })
        return
      }

      this.selectedMarkerId = marker.id
      this.map?.setCenter(marker.position)
      this.nearbyPois = []
      this.clearPoiMarkers()
      this.logger.info('选择标记并居中显示', marker)
    },
    getMarkerSummary(marker: RentalMarker) {
      if (marker.pros) {
        return marker.pros
      }
      if (marker.cons) {
        return marker.cons
      }
      return '未填写信息'
    },
    checkLocalStorageAvailability() {
      const testKey = `${MARKER_STORAGE_KEY}:storage-test`
      try {
        localStorage.setItem(testKey, '1')
        const storedValue = localStorage.getItem(testKey)
        localStorage.removeItem(testKey)
        if (storedValue !== '1') {
          throw new Error('localStorage 读写结果不一致。')
        }
        this.storageStatusMessage = ''
        this.logger.info('localStorage 可用')
      } catch (error) {
        this.storageStatusMessage = '当前浏览器不允许本地自动保存。请使用“保存 JSON”备份数据，下次用“导入 JSON”恢复。'
        this.logger.warn('localStorage 不可用，本地自动保存将被禁用', error)
      }
    },
    loadPlaceSearchHistories() {
      if (this.storageStatusMessage) {
        return
      }
      try {
        const rawHistories = localStorage.getItem(PLACE_SEARCH_HISTORY_STORAGE_KEY)
        const parsedHistories = rawHistories ? JSON.parse(rawHistories) : []
        this.placeSearchHistories = Array.isArray(parsedHistories)
          ? parsedHistories.filter((keyword): keyword is string => typeof keyword === 'string' && Boolean(keyword.trim()))
          : []
      } catch (error) {
        this.placeSearchHistories = []
        this.logger.warn('读取地点搜索历史失败', error)
      }
    },
    savePlaceSearchHistory(keyword: string) {
      const normalizedKeyword = keyword.trim()
      if (!normalizedKeyword) {
        return
      }

      this.placeSearchHistories = [
        normalizedKeyword,
        ...this.placeSearchHistories.filter((history) => history !== normalizedKeyword),
      ].slice(0, MAX_PLACE_SEARCH_HISTORY_COUNT)

      if (this.storageStatusMessage) {
        return
      }

      try {
        localStorage.setItem(PLACE_SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(this.placeSearchHistories))
      } catch (error) {
        this.logger.warn('保存地点搜索历史失败', error)
      }
    },
    selectPlaceSearchHistory(keyword: string) {
      this.placeSearchKeyword = keyword
      this.showPlaceSearchHistory = false
      void this.searchPlaces()
    },
    loadStoredMarkers() {
      if (this.storageStatusMessage) {
        return
      }
      try {
        const rawMarkers = localStorage.getItem(MARKER_STORAGE_KEY)
        if (!rawMarkers) {
          return
        }

        const parsedMarkers = JSON.parse(rawMarkers)
        if (!Array.isArray(parsedMarkers)) {
          this.logger.warn('忽略本地 Marker：数据不是数组')
          return
        }

        const normalizedMarkers = parsedMarkers.map((marker, index): RentalMarker =>
          normalizeMarker(marker, index, this.areaPath, '本地'),
        )

        const markerIds = new Set(normalizedMarkers.map((marker) => marker.id))
        if (markerIds.size !== normalizedMarkers.length) {
          throw new Error('本地 Marker id 不能重复。')
        }

        this.markers = normalizedMarkers
        this.selectedMarkerId = this.markers[0]?.id ?? ''
        this.logger.info('加载本地 Marker 成功', { markerCount: this.markers.length })
      } catch (error) {
        this.logger.error('加载本地 Marker 失败，继续使用默认 Marker', error)
      }
    },
    persistMarkers() {
      if (this.storageStatusMessage) {
        this.logger.warn('跳过保存 Marker：localStorage 不可用', { markerCount: this.markers.length })
        return
      }

      try {
        localStorage.setItem(
          MARKER_STORAGE_KEY,
          JSON.stringify(
            this.markers.map((marker) => ({
              id: marker.id,
              pros: marker.pros,
              cons: marker.cons,
              isRejected: marker.isRejected,
              position: [marker.position[0], marker.position[1]],
            })),
          ),
        )
        this.logger.info('保存 Marker 到本地成功', { markerCount: this.markers.length })
      } catch (error) {
        this.logger.error('保存 Marker 到本地失败', error)
      }
    },
    normalizePoiResults(pois: any[]): SearchPlace[] {
      return pois
        .map((poi: any): SearchPlace | null => {
          if (!poi?.location || !poi?.id || !poi?.name) {
            return null
          }
          const position = this.toPosition(poi.location)
          if (!isValidLngLat(position)) {
            return null
          }
          if (!isPointInPolygon(position, this.areaPath)) {
            return null
          }
          const nearestStation = METRO_LINE_11_STATIONS
            .map((station) => ({
              station,
              distance: calculateDistanceMeters(position, station.position),
            }))
            .sort((current, next) => current.distance - next.distance)[0]
          if (!nearestStation) {
            return null
          }
          return {
            id: String(poi.id),
            name: String(poi.name),
            address: Array.isArray(poi.address) ? poi.address.join('') : String(poi.address ?? ''),
            position,
            nearestMetroStation: nearestStation.station.name,
            distanceToMetroMeters: nearestStation.distance,
          }
        })
        .filter((place: SearchPlace | null): place is SearchPlace => Boolean(place))
        .sort((current, next) => current.distanceToMetroMeters - next.distanceToMetroMeters)
    },
    getAreaCenterPosition(): [number, number] {
      let signedArea = 0
      let centerLng = 0
      let centerLat = 0

      for (let index = 0; index < this.areaPath.length; index += 1) {
        const current = this.areaPath[index]
        const next = this.areaPath[(index + 1) % this.areaPath.length]
        const factor = current[0] * next[1] - next[0] * current[1]
        signedArea += factor
        centerLng += (current[0] + next[0]) * factor
        centerLat += (current[1] + next[1]) * factor
      }

      if (signedArea === 0) {
        const bbox = calculateBBox(this.areaPath)
        return [(bbox.west + bbox.east) / 2, (bbox.south + bbox.north) / 2]
      }

      signedArea *= 0.5
      return [centerLng / (6 * signedArea), centerLat / (6 * signedArea)]
    },
    getAreaSearchRadiusMeters() {
      const center = this.getAreaCenterPosition()
      const radius = Math.max(...this.areaPath.map((position) => calculateDistanceMeters(center, position)))
      return Math.min(Math.max(radius, 3000), 50000)
    },
    async searchPlacesAroundArea(keyword: string) {
      const areaCenter = this.getAreaCenterPosition()
      const radius = this.getAreaSearchRadiusMeters()
      const pageSize = 25
      const createParams = (page: number) =>
        new URLSearchParams({
          key: this.amapKey,
          keywords: keyword,
          location: `${areaCenter[0]},${areaCenter[1]}`,
          radius: String(radius),
          sortrule: 'distance',
          extensions: 'base',
          offset: String(pageSize),
          page: String(page),
        })

      const firstResponse = await fetch(`https://restapi.amap.com/v3/place/around?${createParams(1).toString()}`)
      const firstResult = await firstResponse.json()
      const firstPois = Array.isArray(firstResult?.pois) ? firstResult.pois : []
      const totalCount = Number(firstResult?.count ?? firstPois.length)
      const totalPages = Number.isFinite(totalCount) && totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1
      const remainingPages = Array.from({ length: Math.max(totalPages - 1, 0) }, (_, index) => index + 2)

      const remainingResults = await Promise.all(
        remainingPages.map(async (page) => {
          const response = await fetch(`https://restapi.amap.com/v3/place/around?${createParams(page).toString()}`)
          const result = await response.json()
          return Array.isArray(result?.pois) ? result.pois : []
        }),
      )

      const pois = firstPois.concat(...remainingResults)
      this.logger.info('高德 REST 范围周边分页搜索完成', {
        keyword,
        status: firstResult?.status,
        info: firstResult?.info,
        infocode: firstResult?.infocode,
        totalCount,
        totalPages,
        resultCount: pois.length,
        areaCenter,
        radius,
      })
      return pois
    },
    async searchPlaces() {
      const keyword = this.placeSearchKeyword.trim()
      if (!keyword) {
        this.placeSearchResults = []
        this.selectedSearchPlaceId = ''
        this.clearPlaceSearchMarkers()
        this.mapStatus = '请输入要搜索的地点。'
        this.hasMapError = true
        this.logger.warn('地点搜索中止：关键词为空')
        return
      }

      if (!this.AMap || !this.map) {
        this.mapStatus = '地图未就绪，无法搜索地点。'
        this.hasMapError = true
        this.logger.warn('地点搜索中止：地图未就绪', {
          hasAMap: Boolean(this.AMap),
          hasMap: Boolean(this.map),
        })
        return
      }

      this.isPlaceSearchLoading = true
      this.selectedSearchPlaceId = ''
      this.mapStatus = `正在搜索${keyword}...`
      this.hasMapError = false
      this.logger.info('开始地点搜索', { keyword })

      const searchStartedAt = getNow()
      try {
        const aroundPois = await this.searchPlacesAroundArea(keyword)
        this.logger.info('高德 REST 范围周边搜索完成', {
          keyword,
          durationMs: Math.round(getNow() - searchStartedAt),
          resultCount: aroundPois.length,
        })

        if (aroundPois.length > 0) {
          this.placeSearchResults = this.normalizePoiResults(aroundPois)
          if (this.placeSearchResults.length > 0) {
            this.savePlaceSearchHistory(keyword)
            this.showPlaceSearchHistory = false
            this.renderPlaceSearchMarkers()
            this.isPlaceSearchLoading = false
            this.mapStatus = `找到 ${this.placeSearchResults.length} 个地点。`
            this.hasMapError = false
            return
          }
        }

        const params = new URLSearchParams({
          key: this.amapKey,
          keywords: keyword,
          city: '上海',
          citylimit: 'false',
          extensions: 'base',
          offset: '20',
          page: '1',
        })
        const response = await fetch(`https://restapi.amap.com/v3/place/text?${params.toString()}`)
        const result = await response.json()
        const pois = Array.isArray(result?.pois) ? result.pois : []
        this.logger.info('高德 REST 地点搜索完成', {
          keyword,
          status: result?.status,
          info: result?.info,
          infocode: result?.infocode,
          durationMs: Math.round(getNow() - searchStartedAt),
          resultCount: pois.length,
        })

        if (result?.status === '1' && pois.length > 0) {
          this.placeSearchResults = this.normalizePoiResults(pois)
          if (this.placeSearchResults.length === 0) {
            this.selectedSearchPlaceId = ''
            this.clearPlaceSearchMarkers()
            this.isPlaceSearchLoading = false
            this.mapStatus = `${keyword}在当前范围内没有搜索结果。`
            this.hasMapError = true
            return
          }
          this.renderPlaceSearchMarkers()
          this.savePlaceSearchHistory(keyword)
          this.showPlaceSearchHistory = false
          this.isPlaceSearchLoading = false
          this.mapStatus = `找到 ${this.placeSearchResults.length} 个地点。`
          this.hasMapError = false
          return
        }
      } catch (error) {
        this.logger.warn('高德 REST 地点搜索失败，回退到 JS SDK PlaceSearch', error)
      }

      const hasPlaceSearch = await this.ensureAmapPlugin('AMap.PlaceSearch')
      if (!hasPlaceSearch || !this.AMap?.PlaceSearch) {
        this.isPlaceSearchLoading = false
        this.placeSearchResults = []
        this.selectedSearchPlaceId = ''
        this.clearPlaceSearchMarkers()
        this.mapStatus = `${keyword}在当前范围内没有搜索结果。`
        this.hasMapError = true
        this.logger.warn('地点搜索中止：PlaceSearch 不可用', {
          hasPlaceSearch,
          hasAMapPlaceSearch: Boolean(this.AMap?.PlaceSearch),
        })
        return
      }

      const sdkSearchStartedAt = getNow()
      const placeSearch = new this.AMap.PlaceSearch({
        city: '上海',
        citylimit: false,
        pageSize: 10,
        extensions: 'base',
      })

      placeSearch.search(keyword, (status: string, result: any) => {
        this.isPlaceSearchLoading = false
        this.logger.info('地点搜索完成', {
          keyword,
          status,
          info: result?.info,
          durationMs: Math.round(getNow() - sdkSearchStartedAt),
          resultCount: Array.isArray(result?.poiList?.pois) ? result.poiList.pois.length : 0,
        })

        if (status !== 'complete' || !Array.isArray(result?.poiList?.pois)) {
          this.placeSearchResults = []
          this.selectedSearchPlaceId = ''
          this.clearPlaceSearchMarkers()
          this.mapStatus = `${keyword}在当前范围内没有搜索结果。`
          this.hasMapError = true
          return
        }

        this.placeSearchResults = this.normalizePoiResults(result.poiList.pois)
        if (this.placeSearchResults.length === 0) {
          this.selectedSearchPlaceId = ''
          this.clearPlaceSearchMarkers()
          this.mapStatus = `${keyword}在当前范围内没有搜索结果。`
          this.hasMapError = true
          return
        }
        this.renderPlaceSearchMarkers()
        this.savePlaceSearchHistory(keyword)
        this.showPlaceSearchHistory = false

        this.mapStatus = `找到 ${this.placeSearchResults.length} 个地点。`
        this.hasMapError = false
      })
    },
    renderPlaceSearchMarkers() {
      if (!this.AMap || !this.map) {
        return
      }
      const AMap = this.AMap
      const map = this.map
      this.clearPlaceSearchMarkers()
      this.placeSearchMarkers = this.placeSearchResults.map((place, index) => {
        const markerNode = document.createElement('button')
        markerNode.className = `search-place-marker${
          place.id === this.selectedSearchPlaceId ? ' search-place-marker--active' : ''
        }`
        markerNode.type = 'button'
        markerNode.title = place.name
        markerNode.textContent = String(index + 1)
        markerNode.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          this.selectSearchPlace(place)
        })

        const marker = new AMap.Marker({
          position: place.position,
          anchor: 'bottom-center',
          content: markerNode,
          zIndex: 18,
        })
        map.add(marker)
        return marker
      })
      this.logger.info('搜索结果 Marker 渲染完成', {
        resultCount: this.placeSearchResults.length,
      })
    },
    clearPlaceSearchMarkers() {
      this.placeSearchMarkers.forEach((marker) => marker.setMap(null))
      this.placeSearchMarkers = []
    },
    clearPlaceSearchResults() {
      this.placeSearchKeyword = ''
      this.placeSearchResults = []
      this.selectedSearchPlaceId = ''
      this.showPlaceSearchHistory = false
      this.clearPlaceSearchMarkers()
      this.mapStatus = '已清除搜索结果。'
      this.hasMapError = false
      this.logger.info('清除地点搜索结果')
    },
    updatePlaceSearchMarkerSelection() {
      this.placeSearchMarkers.forEach((marker, index) => {
        const place = this.placeSearchResults[index]
        const content = marker?.getContent?.()
        if (!place || !(content instanceof HTMLElement)) {
          return
        }
        content.classList.toggle('search-place-marker--active', place.id === this.selectedSearchPlaceId)
      })
    },
    formatDistance(meters: number) {
      return formatDistance(meters)
    },
    selectSearchPlace(place: SearchPlace) {
      if (!this.map || !isValidLngLat(place.position)) {
        this.mapStatus = '无法定位该搜索结果。'
        this.hasMapError = true
        this.logger.warn('选择搜索结果失败：地图不存在或坐标非法', {
          hasMap: Boolean(this.map),
          place,
        })
        return
      }

      this.map.setCenter(place.position)
      this.selectedSearchPlaceId = place.id
      this.updatePlaceSearchMarkerSelection()
      this.mapStatus = `已定位到：${place.name}。`
      this.hasMapError = false
      this.logger.info('选择搜索结果并居中显示', place)
    },
    async searchNearby(keyword: string) {
      if (!this.AMap || !this.map || !this.selectedMarker) {
        this.logger.warn('附近搜索中止：缺少地图或标记', {
          hasAMap: Boolean(this.AMap),
          hasMap: Boolean(this.map),
          selectedMarker: this.selectedMarkerId,
        })
        return
      }

      this.mapStatus = `正在搜索${keyword}...`
      this.hasMapError = false

      const hasPlaceSearch = await this.ensureAmapPlugin('AMap.PlaceSearch')
      if (!hasPlaceSearch || !this.AMap?.PlaceSearch) {
        this.mapStatus = '附近搜索插件加载失败。'
        this.hasMapError = true
        this.logger.warn('附近搜索中止：PlaceSearch 不可用', {
          hasPlaceSearch,
          hasAMapPlaceSearch: Boolean(this.AMap?.PlaceSearch),
        })
        return
      }

      this.logger.info('开始附近搜索', {
        keyword,
        marker: this.selectedMarker.id,
        position: this.selectedMarker.position,
      })

      const searchStartedAt = getNow()
      const placeSearch = new this.AMap.PlaceSearch({
        city: '全国',
        pageSize: 8,
        extensions: 'base',
      })

      placeSearch.searchNearBy(keyword, this.selectedMarker.position, 1600, (status: string, result: any) => {
        this.logger.info('附近搜索完成', {
          keyword,
          status,
          durationMs: Math.round(getNow() - searchStartedAt),
          resultCount: Array.isArray(result?.poiList?.pois) ? result.poiList.pois.length : 0,
        })
        if (status !== 'complete' || !Array.isArray(result?.poiList?.pois)) {
          this.nearbyPois = []
          this.clearPoiMarkers()
          this.mapStatus = `${keyword}搜索失败或没有结果。`
          this.hasMapError = true
          return
        }

        this.nearbyPois = result.poiList.pois
          .map((poi: any): NearbyPoi | null => {
            if (!poi?.location || !poi?.id || !poi?.name) {
              return null
            }
            return {
              id: String(poi.id),
              name: String(poi.name),
              address: Array.isArray(poi.address) ? poi.address.join('') : String(poi.address ?? ''),
              position: this.toPosition(poi.location),
            }
          })
          .filter((poi: NearbyPoi | null): poi is NearbyPoi => Boolean(poi))

        this.renderPoiMarkers()
        this.mapStatus = `找到 ${this.nearbyPois.length} 个${keyword}。`
        this.hasMapError = false
      })
    },
    renderPoiMarkers() {
      if (!this.AMap || !this.map) {
        return
      }
      const AMap = this.AMap
      const map = this.map
      this.clearPoiMarkers()
      this.poiMarkers = this.nearbyPois.map((poi) => {
        const marker = new AMap.Marker({
          position: poi.position,
          title: poi.name,
        })
        marker.on('click', () => this.planWalkingRoute(poi))
        map.add(marker)
        return marker
      })
    },
    clearPoiMarkers() {
      this.poiMarkers.forEach((marker) => marker.setMap(null))
      this.poiMarkers = []
    },
    planWalkingRoute(poi: NearbyPoi) {
      this.planRouteToPosition(poi.position)
    },
    enablePickDestination() {
      if (!this.selectedMarker) {
        return
      }
      this.closeMouseTool()
      this.clearPendingArea()
      this.interactionMode = 'pick-route'
      this.mapStatus = '请在地图上点击一个目的地。'
      this.hasMapError = false
      this.logger.info('进入地图选点模式', { marker: this.selectedMarker.id })
    },
    async planRouteToPosition(destination: [number, number]) {
      if (!this.AMap || !this.map || !this.selectedMarker) {
        this.logger.warn('路线规划中止：缺少地图或选中标记', {
          hasAMap: Boolean(this.AMap),
          hasMap: Boolean(this.map),
          selectedMarker: this.selectedMarkerId,
        })
        return
      }

      const hasWalking = await this.ensureAmapPlugin('AMap.Walking')
      if (!hasWalking || !this.AMap?.Walking) {
        this.mapStatus = '路线规划插件加载失败。'
        this.hasMapError = true
        this.logger.warn('路线规划中止：Walking 不可用', {
          hasWalking,
          hasAMapWalking: Boolean(this.AMap?.Walking),
        })
        return
      }

      this.clearRoute()
      const routePanel = document.querySelector('#route-panel')
      this.walkingRoute = new this.AMap.Walking({
        map: this.map,
        panel: routePanel,
      })

      const start = this.selectedMarker.position
      this.mapStatus = '正在规划步行路线...'
      this.hasMapError = false
      this.logger.info('开始路线规划', { start, destination })
      const routeStartedAt = getNow()
      this.walkingRoute.search(start, destination, (status: string, result: any) => {
        this.logger.info('路线规划完成', {
          status,
          durationMs: Math.round(getNow() - routeStartedAt),
          result,
        })
        if (status !== 'complete') {
          this.mapStatus = '路线规划失败，请换一个目的地或检查服务权限。'
          this.hasMapError = true
          return
        }
        this.mapStatus = '路线规划完成。'
        this.hasMapError = false
      })
    },
    clearRoute() {
      this.walkingRoute?.clear?.()
      this.walkingRoute = null
      const routePanel = document.querySelector('#route-panel')
      if (routePanel) {
        routePanel.innerHTML = ''
      }
      this.logger.info('路线已清除')
    },
    toPosition(lnglat: any): [number, number] {
      if (typeof lnglat === 'string') {
        const [lng, lat] = lnglat.split(',').map((value) => Number(value.trim()))
        return [lng, lat]
      }
      if (Array.isArray(lnglat)) {
        return [Number(lnglat[0]), Number(lnglat[1])]
      }
      if (typeof lnglat?.getLng === 'function' && typeof lnglat?.getLat === 'function') {
        return [Number(lnglat.getLng()), Number(lnglat.getLat())]
      }
      return [Number(lnglat?.lng), Number(lnglat?.lat)]
    },
    async isInsideArea(position: [number, number]) {
      const hasGeometryUtil = await this.ensureAmapPlugin('AMap.GeometryUtil')
      if (!hasGeometryUtil || !this.AMap?.GeometryUtil) {
        const fallbackResult = isPointInPolygon(position, this.areaPath)
        this.logger.warn('GeometryUtil 不存在或加载失败，使用本地多边形算法校验范围', {
          position,
          fallbackResult,
        })
        return fallbackResult
      }
      return this.AMap.GeometryUtil.isPointInRing(position, this.areaPath)
    },
    escapeHtml(value: string) {
      return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
    },
  },
})
</script>
