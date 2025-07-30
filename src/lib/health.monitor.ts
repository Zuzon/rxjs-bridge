class RxjsBridgeHealth {
  private _activeJoints: RxjsBridgeJoint[] = [];

  public addJoint(joint: RxjsBridgeJoint) {
    this._activeJoints.push(joint);
  }

  public removeJoint(id: number, type: 'socket' | 'worker', method: string) {
    const joint = this._activeJoints.find((j) => j.id === id && j.type === type);
    if (joint) {
      this._activeJoints.splice(this._activeJoints.indexOf(joint), 1);
    }
  }

  public checkHealth(): RxjsBridgeHealthStatus {
    const result: RxjsBridgeHealthStatus = {
      totalJointAmount: 0,
      socketJointAmount: 0,
      workerJointAmount: 0,
      socketServiceJoints: {},
      workerServiceJoints: {},
    };
    this._activeJoints.forEach((joint) => {
      result.totalJointAmount++;
      if (joint.type === 'socket') {
        result.socketJointAmount++;
        if (!result.socketServiceJoints[joint.service]) {
          result.socketServiceJoints[joint.service] = {
            _total: 0,
          };
        }
        if (!result.socketServiceJoints[joint.service][joint.method]) {
          result.socketServiceJoints[joint.service][joint.method] = 1;
        } else {
          result.socketServiceJoints[joint.service][joint.method]++;
        }
        result.socketServiceJoints[joint.service]._total++;
      } else if (joint.type === 'worker') {
        result.workerJointAmount++;
        if (!result.workerServiceJoints[joint.service]) {
          result.workerServiceJoints[joint.service] = {
            _total: 0,
          };
        }
        if (!result.workerServiceJoints[joint.service][joint.method]) {
          result.workerServiceJoints[joint.service][joint.method] = 1;
        } else {
          result.workerServiceJoints[joint.service][joint.method]++;
        }
        result.workerServiceJoints[joint.service]._total++;
      }
    });
    return result;
  }
}

export interface RxjsBridgeJoint {
  type: 'socket' | 'worker';
  service: string;
  method: string;
  id: number;
}

export interface RxjsBridgeHealthStatus {
  totalJointAmount: number;
  socketJointAmount: number;
  workerJointAmount: number;
  socketServiceJoints: {
    [key: string]: {
      [key: string]: number;
    };
  };
  workerServiceJoints: {
    [key: string]: {
      [key: string]: number;
    };
  };
}

export const rxjsBridgeHealthMonitor = new RxjsBridgeHealth();
