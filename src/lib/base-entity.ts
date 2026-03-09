import {
  Column,
  CreateDateColumn,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/** 엔티티 상태 값 */
export enum STATUS {
  ACTIVE = 0,
  INACTIVE = 1,
  DELETED = 255,
}

/**
 * 모든 엔티티의 기본 클래스 (id, status, createdAt, updatedAt)
 * (원본: @lxp/base BaseTableEntity + BaseDateAuditEntity)
 */
export abstract class BaseTableEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: number;

  @Column({ type: "tinyint", unsigned: true, default: STATUS.ACTIVE })
  @Index()
  status: STATUS;

  @CreateDateColumn({ type: "datetime", precision: 6 })
  createdAt: Date;

  @UpdateDateColumn({ type: "datetime", precision: 6 })
  updatedAt: Date;
}
