import { NextFunction, Request, Response, Router } from 'express';
import asyncHandler from 'express-async-handler';
import { ZodTypeAny } from 'zod';
import {
  errorResponseSchema,
  successResponseSchema,
} from '../common/common.schema';
import { canAccess } from '../middlewares/can-access.middleware';
import { validateZodSchema } from '../middlewares/validate-zod-schema.middleware';
import {
  RequestExtended,
  RequestZodSchemaType,
  ResponseExtended,
} from '../types';
import responseInterceptor from '../utils/responseInterceptor';
import {
  camelCaseToTitleCase,
  parseRouteString,
  routeToClassName,
} from './openapi.utils';
import { bearerAuth, registry } from './swagger-instance';

type Method =
  | 'get'
  | 'post'
  | 'put'
  | 'delete'
  | 'patch'
  | 'head'
  | 'options'
  | 'trace';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IDontKnow = unknown | never | any;
export type MaybePromise = void | Promise<void>;
export type RequestAny = Request<IDontKnow, IDontKnow, IDontKnow, IDontKnow>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ResponseAny = Response<IDontKnow, Record<string, any>>;
export type MagicRoutePType<PathSet extends boolean> = PathSet extends true
  ? [reqAndRes: RequestAndResponseType, ...handlers: MagicMiddleware[]]
  : [
      path: string,
      reqAndRes: RequestAndResponseType,
      ...handlers: MagicMiddleware[],
    ];
export type MagicRouteRType<PathSet extends boolean> = Omit<
  MagicRouter<PathSet>,
  'route' | 'getRouter' | 'use'
>;
export type MagicMiddleware = (
  req: RequestAny,
  res: ResponseAny,
  next?: NextFunction,
) => MaybePromise;

export type RequestAndResponseType = {
  requestType?: RequestZodSchemaType;
  responseModel?: ZodTypeAny;
};

export class MagicRouter<PathSet extends boolean = false> {
  private router: Router;
  private rootRoute: string;
  private currentPath?: string;

  constructor(rootRoute: string, currentPath?: string) {
    this.router = Router();
    this.rootRoute = rootRoute;
    this.currentPath = currentPath;
  }

  private getPath(path: string) {
    return this.rootRoute + parseRouteString(path);
  }

  private wrapper(
    method: Method,
    path: string,
    requestAndResponseType: RequestAndResponseType,
    ...middlewares: Array<MagicMiddleware>
  ): void {
    const bodyType = requestAndResponseType.requestType?.body;
    const paramsType = requestAndResponseType.requestType?.params;
    const queryType = requestAndResponseType.requestType?.query;
    const responseType =
      requestAndResponseType.responseModel ?? successResponseSchema;

    const className = routeToClassName(this.rootRoute);
    const title = camelCaseToTitleCase(
      middlewares[middlewares.length - 1]?.name,
    );

    const bodySchema = bodyType
      ? registry.register(`${title} Input`, bodyType)
      : null;

    const hasSecurity = middlewares.some((m) => m.name === canAccess().name);

    const attachResponseModelMiddleware = (
      _: RequestAny,
      res: ResponseAny,
      next: NextFunction,
    ) => {
      res.locals.validateSchema = requestAndResponseType.responseModel;
      next();
    };

    registry.registerPath({
      method: method,
      tags: [className],
      path: this.getPath(path),
      security: hasSecurity ? [{ [bearerAuth.name]: ['bearer'] }] : [],
      description: title,
      summary: title,
      request: {
        params: paramsType,
        query: queryType,
        ...(bodySchema
          ? {
              body: {
                content: {
                  'application/json': {
                    schema: bodySchema,
                  },
                },
              },
            }
          : {}),
      },
      responses: {
        200: {
          description: '',
          content: {
            'application/json': {
              schema: responseType,
            },
          },
        },
        400: {
          description: 'API Error Response',
          content: {
            'application/json': {
              schema: errorResponseSchema,
            },
          },
        },
        404: {
          description: 'API Error Response',
          content: {
            'application/json': {
              schema: errorResponseSchema,
            },
          },
        },
        500: {
          description: 'API Error Response',
          content: {
            'application/json': {
              schema: errorResponseSchema,
            },
          },
        },
      },
    });

    const requestType = requestAndResponseType.requestType ?? {};

    const controller = asyncHandler(middlewares[middlewares.length - 1]);

    const responseInterceptorWrapper = (
      req: RequestAny | RequestExtended,
      res: ResponseAny | ResponseExtended,
      next: NextFunction,
    ) => {
      return responseInterceptor(
        req as RequestExtended,
        res as ResponseExtended,
        next,
      );
    };

    middlewares.pop();

    if (Object.keys(requestType).length) {
      this.router[method](
        path,
        attachResponseModelMiddleware,
        responseInterceptorWrapper,
        validateZodSchema(requestType),
        ...middlewares,
        controller,
      );
    } else {
      this.router[method](
        path,
        attachResponseModelMiddleware,
        ...middlewares,
        responseInterceptorWrapper,
        controller,
      );
    }
  }

  public get(...args: MagicRoutePType<PathSet>): MagicRouteRType<PathSet> {
    if (this.currentPath) {
      console.log(this.currentPath);
      const [reqAndRes, ...handlers] = args as [
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('get', this.currentPath, reqAndRes, ...handlers);
    } else {
      const [path, reqAndRes, ...handlers] = args as [
        string,
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('get', path, reqAndRes, ...handlers);
    }
    return this;
  }

  public post(...args: MagicRoutePType<PathSet>): MagicRouteRType<PathSet> {
    if (this.currentPath) {
      const [reqAndRes, ...handlers] = args as [
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('post', this.currentPath, reqAndRes, ...handlers);
    } else {
      const [path, reqAndRes, ...handlers] = args as [
        string,
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('post', path, reqAndRes, ...handlers);
    }
    return this;
  }

  public delete(...args: MagicRoutePType<PathSet>): MagicRouteRType<PathSet> {
    if (this.currentPath) {
      const [reqAndRes, ...handlers] = args as [
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('delete', this.currentPath, reqAndRes, ...handlers);
    } else {
      const [path, reqAndRes, ...handlers] = args as [
        string,
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('delete', path, reqAndRes, ...handlers);
    }
    return this;
  }

  public patch(...args: MagicRoutePType<PathSet>): MagicRouteRType<PathSet> {
    if (this.currentPath) {
      const [reqAndRes, ...handlers] = args as [
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('patch', this.currentPath, reqAndRes, ...handlers);
    } else {
      const [path, reqAndRes, ...handlers] = args as [
        string,
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('patch', path, reqAndRes, ...handlers);
    }
    return this;
  }

  public put(...args: MagicRoutePType<PathSet>): MagicRouteRType<PathSet> {
    if (this.currentPath) {
      const [reqAndRes, ...handlers] = args as [
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('put', this.currentPath, reqAndRes, ...handlers);
    } else {
      const [path, reqAndRes, ...handlers] = args as [
        string,
        RequestAndResponseType,
        ...MagicMiddleware[],
      ];
      this.wrapper('put', path, reqAndRes, ...handlers);
    }
    return this;
  }

  public use(...args: Parameters<Router['use']>): void {
    this.router.use(...args);
  }

  public route(path: string): MagicRouteRType<true> {
    return new MagicRouter<true>(this.rootRoute, path);
  }

  // Method to get the router instance
  public getRouter(): Router {
    return this.router;
  }
}

export default MagicRouter;
